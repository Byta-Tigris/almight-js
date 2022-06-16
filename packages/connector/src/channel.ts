import WalletConnect from "@walletconnect/client";
import { AsyncCallTimeOut, asyncCallWithTimeBound, isWebPlatform } from "@almight-sdk/utils";
import { IncompatiblePlatform, IncompatibleSessionData, ProviderConnectionError, ProviderRequestTimeout, SessionIsNotDefined } from "./exceptions";
import {
    Address, BasicExternalProvider, BrowserSessionStruct, ConnectorType, IChannelBehaviourPlugin, IProviderAdapter,
    IProviderSessionData, ISession, ProviderChannelInterface, ProviderRequestMethodArguments,
    SessioUpdateArguments,
    SubscriptionCallback, WalletConnectSessionStruct
} from "./types";
import { IWalletConnectOptions, IPushServerOptions } from "@walletconnect/types";

/**
 * Channels are adapter for communication with wallets
 * WalletConnect and Browser-Injected Providers are two channels used for communication
 * 
 * Channels holds information regarding session and connection and request method allows to 
 * request task and operations
 * 
 */
export class BaseProviderChannel implements ProviderChannelInterface {



    public static connectorType: ConnectorType;

    public static isChannelClass = true;

    public get connectorType(): ConnectorType { return (this.constructor as any).connectorType }
    protected _session?: IProviderSessionData;
    protected _provider?: any;

    protected clientMeta?: Record<string, any> = {};

    public setClientMeta(meta: Record<string, any>): void {
        this.clientMeta = meta;
    }

    protected _accounts: Address[];
    public get provider(): any { return this._provider }
    public get accounts(): Address[] { return this._accounts }


    public setProvider(provider: BasicExternalProvider | WalletConnect): void {
        this._provider = provider;
    }

    protected _isConnected = false;
    protected _behaviourPlugin?: IChannelBehaviourPlugin;


    public static validateSession(session: any): boolean {
        throw new Error("method not implemented")
    }


    // Waiting time for request to be approved (in milliseconds)
    // 5 minutes of waiting time
    public requestTimeout = 300000;

    public get isConnected(): boolean { return this._isConnected }
    public get session(): IProviderSessionData | undefined { return this._session }


    constructor(session?: IProviderSessionData, plugin?: IChannelBehaviourPlugin) {
        this.init(session)
        if (plugin !== undefined) {
            this._behaviourPlugin = plugin;
        }
    }


    getCompleteSessionForStorage(): ISession {
        throw new Error("Method not implemented.");
    }
    checkEnvironment(): Promise<boolean> {
        throw new Error("Method not implemented.");
    }



    getBehaviourMethod(name: string, obj?: IProviderAdapter): any {
        if (obj !== undefined && (obj as any)[name] !== undefined && typeof (obj as any)[name] === "function") {
            return (obj as any)[name];
        } else if (this._behaviourPlugin !== undefined && (this._behaviourPlugin as any)[name] !== undefined) {
            return (this._behaviourPlugin as any)[name];
        }
        return undefined;
    }


    /**
     * @method
     * The method @throws ProviderConnectionError if the session is not connected
     * 
     * @param data request arguments for provider request
     * @returns result of the request
     */
    async request<T = any>(data: ProviderRequestMethodArguments, timeout?: number): Promise<T> {
        if (this.provider === undefined) throw new ProviderConnectionError();
        return await this._timeBoundRequest<T>(data, timeout || this.requestTimeout);
    }
    init(session?: IProviderSessionData): void {
        this._session = session;
    }

    // The method is added for making it compatible with ethersjs.BaseProvider
    async send<T = any>(method, params, timeout?: number): Promise<T> {
        return await this.request<T>({ method: method, params: params }, timeout);
    }



    public async defaultCheckSession(obj?: IProviderAdapter): Promise<[boolean, any]> {
        throw new Error("Method not implemented.");
    }

    /**
     * Validates the session structure

     * 
     * When overriding this method, make sure to implement @method getBehaviourMethod to
     * update the behaviour of channel by plugin or @interface IProivderAdapter
     * 
     * @returns boolean indicating session is working or not and Provider instance
     */
    async checkSession(obj?: IProviderAdapter): Promise<[boolean, any]> {

        const method = this.getBehaviourMethod("channelCheckSession", obj)
        if (method !== undefined) {
            return await method(this.session, this);
        }
        return await this.defaultCheckSession(obj);
    }


    async defaultConnect(options?: any, obj?: IProviderAdapter): Promise<void> {
        throw new Error("Method not implemented.");
    }


    /**
     * The method required to test the session's connection or connect with the provider
     * When overriding the default implementation, proper care of connection procedure must 
     * be taken care when connecting with or without session
     * 
     * @param options 
     * @param obj 
     * @returns 
     */
    async connect(options?: any, obj?: IProviderAdapter): Promise<void> {
        const method = this.getBehaviourMethod("channelConnect", obj)
        if (method !== undefined) {
            return await method(options, this);
        }
        await this.defaultConnect(options, obj);
        // this.onConnect(options, obj);
    }

    /**
     * Verify connection of provider by pinging a fake request
     * @method ping will make a fake 'ping' RPC request and expect for 
     * the defined error. If @method verifyPingException passes the exception
     * the connection will be assumed to be established and session to be healthy
     * 
     */
    async checkConnection(obj?: IProviderAdapter): Promise<boolean> {
        if (this.provider === undefined) return false;
        const pingResult = await this.ping({ obj: obj });
        this._isConnected = this.provider !== undefined && pingResult;
        return this.isConnected;
    }

    /** 
    * Pinging provider to check the health of session.
    * Whenever Provider is requested with an invalid method
    * the provider should return defined JSON-RPC Error.
    * 
    * The request method is a TimeBound Promise to keep track of time for each request
    * and when any request during the 'ping' @throws ProviderRequestTimeout Erro then
    * the session will considered dead otherwise it'll be considered healthy
    * 
    */
    async ping({ method = "ping", obj }: { method?: string, obj?: IProviderAdapter }): Promise<boolean> {
        const _method = this.getBehaviourMethod("channelPing", obj)
        if (_method !== undefined) {
            return await _method({}, this);
        }

        try {
            if (obj !== undefined && (obj as any)["pingMethod"] !== undefined) {
                method = (obj as any)["pingMethod"]
            }
            await this.request({ method: method, params: [] })
        } catch (e) {
            const method = this.getBehaviourMethod("channelVerifyPingException", obj);
            if (method !== undefined) return method(e, this)
            return this.verifyPingException(e);
        }
        return false;
    }
    /**
     * Each provider on different platform has different way of telling
     * the Invalid  request. 
     * 
     * This method will verify the exception and indicates whether the exception is 
     * equivalent to the required execption or not.
     * @param exception 
     */
    verifyPingException(exception: Error): boolean {
        return true
    }

    async _timeBoundRequest<T>(data: ProviderRequestMethodArguments, timeout: number): Promise<T> {
        try {
            const result = await asyncCallWithTimeBound(this._rawRequest<T>(data), timeout) as Promise<T>
            return result
        } catch (e) {
            if (e instanceof AsyncCallTimeOut) {
                throw new ProviderRequestTimeout()
            }
            throw e
        }
    }

    async _rawRequest<T = any>(data: ProviderRequestMethodArguments): Promise<T> {
        throw new Error("Method not implemented.");
    }

    on(name: string, callback: SubscriptionCallback): void {
        if (this._provider !== undefined) {
            this._provider.on(name, callback);
        }
    }

    onConnect(options: any, obj?: IProviderAdapter): void {
        const method = this.getBehaviourMethod("channelOnConnect", obj);
        if (method !== undefined) return method(options, this)
    }

    onSessionUpdate(options?: SessioUpdateArguments): void {

    }

    bindSessionListener(obj?: IProviderAdapter): void {
        const method = this.getBehaviourMethod("channelbindSessionListener", obj);
        if (method !== undefined) return method();
        this.defaultbindSessionListener();
    }
    defaultbindSessionListener(): void {

    }

}


export class BrowserProviderChannel extends BaseProviderChannel {

    public static connectorType: ConnectorType = ConnectorType.BrowserExtension;
    protected _session?: BrowserSessionStruct;
    protected _provider?: BasicExternalProvider;


    protected _providerPath?: string;

    public get session(): BrowserSessionStruct {
        return this._session
    }

    public getCompleteSessionForStorage(): BrowserSessionStruct {
        return { path: this.providerPath, chainId: 0 }
    }

    public get provider(): BasicExternalProvider { return this._provider }
    public get providerPath(): string { return (this.session !== undefined && this.session.path !== undefined) ? this.session.path : this._providerPath }
    public set providerPath(_path: string) { this._providerPath = _path }

    public static validateSession(session: any): boolean {
        if (session['path'] === undefined || session['chainId'] === undefined) throw new IncompatibleSessionData();
        return true;
    }

    init(session?: BrowserSessionStruct) {
        super.init(session)
    }

    override async checkEnvironment(): Promise<boolean> {
        return isWebPlatform();
    }

    override async _rawRequest<T = any>(data: ProviderRequestMethodArguments): Promise<T> {
        return (await this.provider.request({ method: data.method, params: data.params })) as T
    }

    override async defaultCheckSession(obj?: IProviderAdapter): Promise<[boolean, any]> {
        if (this.session !== undefined) {
            BrowserProviderChannel.validateSession(this.session)
        }
        return [this.providerPath !== undefined && (globalThis as any)[this.providerPath] !== undefined, (globalThis as any)[this.providerPath]];
    }

    override async checkSession(obj?: IProviderAdapter): Promise<[boolean, BasicExternalProvider]> {
        return await super.checkSession(obj)
    }

    override async connect(options?: BasicExternalProvider, obj?: IProviderAdapter): Promise<void> {
        await super.connect(options, obj)
        await this.checkConnection(obj);

    }

    override verifyPingException(exception: Error): boolean { 
        return exception.message.includes(`The method "ping" does not exist`);
    }


    defaultbindSessionListener(): void {
        if (this.provider === undefined) return;
        this.on("accountsChanged", (accounts: any) => {
            this.onSessionUpdate({
                accounts: accounts as Address[]
            });
        })
        this.on("chainChanged", (chainId) => {
            this.onSessionUpdate({ chainId })
        })
    }


    override async checkConnection(obj): Promise<boolean> {
        if (!isWebPlatform()) {
            throw new IncompatiblePlatform()
        }
        const result = await super.checkConnection(obj);
        if (result) {
            this.bindSessionListener(obj)
        }

        this.onConnect({}, obj);
        return result
    }

    override async defaultConnect(provider?: BasicExternalProvider, obj?: IProviderAdapter): Promise<void> {
        if (provider !== undefined) {
            this._provider = provider;
            return;
        }
        const [isSessionValid, _provider] = await this.checkSession(obj);
        if (isSessionValid && _provider !== undefined) {
            this._provider = _provider;
        }
        return;
    }

}


export class WalletConnectChannel extends BaseProviderChannel {

    public static connectorType: ConnectorType = ConnectorType.WalletConnector;
    protected _session?: WalletConnectSessionStruct;
    protected _provider?: WalletConnect;

    protected _params?: any;

    static nextId = 0;
    public bridge = "https://bridge.walletconnect.org";

    public get session(): WalletConnectSessionStruct { return this._session }
    public get provider(): WalletConnect { return this._provider }


    public getCompleteSessionForStorage(): WalletConnectSessionStruct {
        return this._provider.session;
    }


    init(session?: WalletConnectSessionStruct) {
        if (isWebPlatform()) {
            (globalThis as any).Buffer = require("buffer").Buffer;
        }
        super.init(session)
    }

    override async checkEnvironment(): Promise<boolean> {
        return true;
    }

    public static validateSession(session: any, silent: boolean = false): boolean {
        for (const prop of ["chainId", "bridge", "key", "clientId", "peerId", "handshakeId", "handshakeTopic"]) {
            if (session[prop] === undefined) {
                if (silent) {
                    return false
                } else {
                    throw new IncompatibleSessionData()
                }
            }
        }
        return true;
    }

    override async _rawRequest<T = any>(data: ProviderRequestMethodArguments): Promise<T> {
        return await this.provider.sendCustomRequest({
            id: WalletConnectChannel.nextId,
            jsonrpc: "2.0",
            method: data.method,
            params: data.params as any[]
        }) as T
    }

    override verifyPingException(exception: Error): boolean {
        return (!(exception instanceof ProviderRequestTimeout) && (exception.message.indexOf("Internal JSON-RPC error") != -1));
    }

    walletconnect(options: IWalletConnectOptions, pushOpts?: IPushServerOptions): WalletConnect {
        options.bridge = options.bridge || this.bridge;
        options.session = options.session || this.session;
        options.clientMeta = options.clientMeta || this.clientMeta as any;
        const wallet = new WalletConnect(options, pushOpts);

        return wallet
    }


    checkConnectionAndCallOnConnect(obj: IProviderAdapter, params: {error?: Error, payload?: any}): void {
        if (params.error) throw params.error
        this.checkConnection(obj).then((value) => {
            if (!value) return;
            this.onConnect(params , obj);
        });

    }

    override async defaultConnect(args: { options?: IWalletConnectOptions, pushOpts?: IPushServerOptions } | WalletConnect = {}, obj?: IProviderAdapter): Promise<void> {

        if (args instanceof WalletConnect) {
            this._provider = args;
            this._isConnected = args.connected;
            this._session = args.session;
            this.checkConnectionAndCallOnConnect(obj, { payload: { params: [this._provider.session] } });
        } else {
            const { options, pushOpts } = args;
            const [isSessionValid, provider] = await this.checkSession(obj);
            if (isSessionValid && provider !== undefined) {
                this._provider = provider;
                this.checkConnectionAndCallOnConnect(obj, { payload: [provider.session] });
            } else {
                // Empty WalletConnect Instance
                this._provider = this.walletconnect(options ?? {}, pushOpts);
                if (this.provider.key.length === 0) {
                    await this.provider.createSession();
                }
                this._provider.on("connect", (error, payload) => {
                    this.checkConnectionAndCallOnConnect(obj, {error, payload})
                });
            }

        }

    }


    override async checkSession(obj?: IProviderAdapter): Promise<[boolean, WalletConnect]> {
        if (this.session !== undefined) {
            WalletConnectChannel.validateSession(this.session);
        }
        return await super.checkSession(obj)
    }

    isSessionConnected(): boolean {
        return this._provider !== undefined && this.provider.session !== undefined && this.provider.key.length > 0 && this.provider.connected;
    }

    override async connect(options?: { options?: IWalletConnectOptions, pushOpts?: IPushServerOptions } | WalletConnect, obj?: IProviderAdapter): Promise<void> {

        await super.connect(options, obj)
        if (this.isSessionConnected()) {
            await this.checkConnection(obj);
        }
    }

    /**
     * Walletconnect protocol generates a unique uri for each session connection
     * the uri will later be used to redirect Dapps using QR codes or direct visits
     * 
     * The function will extract the uri the uri from walletconnect provider
     * 
     * @returns uri string for wallet connect connection
     */
    getConnectorUri(): string {
        return this.provider.uri;
    }


    defaultbindSessionListener(): void {
        this.on("session_update", (error: Error, payload: any) => {
            if (error) throw error;
            if (payload.params !== undefined && payload.params.length > 0) {
                this._params = payload.params[0];
            } else {
                this._params = payload[0];
            }
            const { accounts, chainId } = this._params;
            this._session = this._provider.session;
            this.onSessionUpdate({ accounts, chainId });
        })
    }

    onConnect(options: { error?: Error, payload?: any }, obj?: IProviderAdapter) {

        const method = this.getBehaviourMethod("channelOnConnect", obj);
        if (options !== undefined && (options.payload !== undefined)) {
            const { payload } = options;
            if (payload.params !== undefined && payload.params.length > 0) {
                this._params = payload.params[0];
            } else {
                this._params = payload[0];
            }
            const { accounts } = this._params;
            this._accounts = accounts;
            this._session = this._provider.session;
            const chainId = this._provider.chainId;
            this.bindSessionListener(obj);

            if (method !== undefined) {
                method({
                    accounts: accounts,
                    chainId: chainId
                });
            }
        } else {
            method(options);
        }
    }

    override async defaultCheckSession(obj?: IProviderAdapter): Promise<[boolean, any]> {
        if (this.session !== undefined && WalletConnectChannel.validateSession(this.session)) {
            return [true, this.walletconnect({ session: this.session })];
        }
        // Create empty walletconnect instance
        return [false, undefined];


    }

}