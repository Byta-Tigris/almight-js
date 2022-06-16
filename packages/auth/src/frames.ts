import { Class, isWebPlatform, Providers } from "@almight-sdk/utils";
import { BaseChainAdapter, BaseConnector, BaseProviderChannel, ConnectorType, WalletConnectChannel } from "@almight-sdk/connector";
import { AuthenticationApp } from "./auth";
import { Web3AuthenticationDelegate } from "./delegate";
import { AuthenticationAppIsNotDefinedProperly } from "./exceptions";
import { Web3NativeOriginFrameCommunicator } from "./frame_communicator";
import { AllowedQueryParams, AuthenticationRespondStrategy, IAuthenticationFrame, ProviderConfiguration, RespondMessageData, RespondType } from "./types";
import { WebConnectorModal } from "./components";


export class AuthenticationFrame implements IAuthenticationFrame {

 

    respondStrategy: AuthenticationRespondStrategy = AuthenticationRespondStrategy.None;
    app?: AuthenticationApp;
    configs?: ProviderConfiguration;

    async initAuth(data: Record<string, string>): Promise<void> {
        data[AllowedQueryParams.RespondStrategy] = this.respondStrategy;
        // data[AllowedQueryParams.TargetOrigin] = globalThis.location.origin;
    }

    constructor(configs?: ProviderConfiguration){
        this.configs = configs
    }


    getConfigForProvider(provider: Providers, connectorType: ConnectorType): Record<string, any> | undefined{
        if(this.configs === undefined || this.configs[provider] === undefined) return;
        return this.configs[provider][connectorType];
    }

  

    bindListener(): void {
        throw new Error("Method not implemented.");
    }

    async close(): Promise<void> {
        
        throw new Error("Method not implemented.");
    }

    async captureResponse(data: RespondMessageData): Promise<void> {
        await this.close();
        this.onResponsCallback(data);
    }

    onResponsCallback(data: RespondMessageData): void {
        // console.log("response", data, this.app)
        if (this.app === undefined) throw new AuthenticationAppIsNotDefinedProperly()
        if ((data.respondType === RespondType.Error && data[AllowedQueryParams.Error] !== "Request aborted") || data.access === undefined) {
            this.app.onFailureCallback({
                [AllowedQueryParams.Error]: data[AllowedQueryParams.Error],
                [AllowedQueryParams.ErrorCode]: data[AllowedQueryParams.ErrorCode]
            });
            return;
        }
        // Implement Success
        this.handleSuccessResponse(data);
    }

    async handleSuccessResponse(data: RespondMessageData): Promise<void> {
        delete data.messageType;
        delete data.respondType;
        if(data.refresh !== undefined){
            delete data.refresh;
            delete data.access;
        }
        this.app.onSuccessCallback(data);
    }

    generateFrameUri(data: Record<string, string>): string {
        const baseUrl = `${this.app.baseAuthenticationURL}/auth/v1/init`;
        const url = new URL(baseUrl);
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                url.searchParams.append(key, value)
            }
        }

        return encodeURI(url.toString());

    }

}



export class Web3NativeAuthenticationFrame extends AuthenticationFrame {
    respondStrategy: AuthenticationRespondStrategy = AuthenticationRespondStrategy.None;
    delegate?: Web3AuthenticationDelegate;

    connectionCount: number = 0;

    browserAdapter?: BaseChainAdapter;
    walletconnectAdapter?: BaseChainAdapter;
    deeplinkAdapter?: BaseChainAdapter;

    modal: WebConnectorModal = new WebConnectorModal();

    override async close(): Promise<void> {
        
    }

    override bindListener(): void {
        
    }

    getConfigsForConnectorType(connectorType: ConnectorType): Record<string, any> | undefined {
        if(this.delegate === undefined) return;
        return this.getConfigForProvider(this.delegate.identityResolver.provider.identifier, connectorType);
    }

    // Element will dispatch 'buttonclick' event on button click
    mountModal(): void {

        this.modal.open({
            hasConnectorButton: this.browserAdapter !== undefined,
            hasQRCode: this.walletconnectAdapter !== undefined,
            buttonText: (this.browserAdapter !== undefined)? "Connect Browser Wallet": "Connect",
            uri: (this.walletconnectAdapter !== undefined)? (this.walletconnectAdapter.channel as WalletConnectChannel).getConnectorUri(): undefined,
            icon: this.delegate.identityResolver.provider.metaData.icon,
            provider: this.delegate.identityResolver.provider.identityProviderName,
            onConnectClick:() => {
                if (this.browserAdapter !== undefined && this.browserAdapter.channel.connectorType === ConnectorType.BrowserExtension) {
                    this.browserAdapter.connect(this.getConfigsForConnectorType(ConnectorType.BrowserExtension)).catch(err => {
                        if(this.browserAdapter !== undefined && this.browserAdapter.onConnectCallback !== undefined){
                            this.connectionCount += 1;
                            this.browserAdapter?.onConnectCallback({data:{
                                [AllowedQueryParams.Error]: err.message,
                                [AllowedQueryParams.ErrorCode]: err.code
                            }})
                        }
                    })
        
                }
            }
        });
    }

    async handleAuthenticationOnWebNativePlatform(): Promise<void> {
        const adapterClass: Class<BaseChainAdapter> = this.delegate.identityResolver.provider.getAdapterClass() as Class<BaseChainAdapter>;
        const channelClasses: Class<BaseProviderChannel>[] = this.delegate.identityResolver.provider.getChannels();

        const allAdaptersConnectd = [];

        
        for (const channelClass of channelClasses){
            const adapter = new adapterClass({
                channel :new channelClass(),
                onConnect: (options?: any) => {    
                    // Multiple connect event fire guard  
                    if(this.connectionCount !== 0) return;
                    this.connectionCount += 1;
                    this.modal.close();
                    options[AllowedQueryParams.ConnectorType] = adapter.channel.connectorType;
                    options["session"] = adapter.getSession();
                    this.delegate.identityResolver.onAuthenticationRedirect(options);
                }
            });

            // TODO: Implement method to allow only passing channels for mounting

            if(adapter.channel.connectorType === ConnectorType.BrowserExtension){
                this.browserAdapter = adapter;
                allAdaptersConnectd.push(true);
                if(allAdaptersConnectd.length === channelClasses.length){
                    this.mountModal();
                }
            }else if(adapter.channel.connectorType === ConnectorType.WalletConnector){
                adapter.connect(this.getConfigsForConnectorType(ConnectorType.WalletConnector)).then(() => {
                    this.walletconnectAdapter = adapter;
                    allAdaptersConnectd.push(true);
                    if(allAdaptersConnectd.length === channelClasses.length){
                        this.mountModal();
                    }
                })
            }
        }
    }

    override async initAuth(data: Record<string, string>): Promise<void> {
        super.initAuth(data);
        /// setup the delegate and call authentication
        this.delegate = new Web3AuthenticationDelegate({
            storage: this.app.storage,
            respondFrame: new Web3NativeOriginFrameCommunicator({
                onResponse: (data: Record<string, string>) => {
                    this.captureResponse((data as unknown) as RespondMessageData);
                }
            })
        });

        await this.delegate.clean();
        
        await this.delegate.setStates(data)

        await this.delegate.captureData()

        // TODO: Show UI for authentication for web
        if(isWebPlatform()) {
            await this.handleAuthenticationOnWebNativePlatform();
        }
        

    }

    override async handleSuccessResponse(data: RespondMessageData): Promise<void> {     
        if(data.access === undefined) return;
            await this.app.storeJWTToken(data.access);
            const userData = await this.app.getUserData(data.access);
            await this.app.saveUserData(userData);
            data.user = userData;
            await this.app.setupConnector();
            super.handleSuccessResponse(data);
               
    }


}

