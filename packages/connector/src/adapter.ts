import { BaseProviderChannel, BrowserProviderChannel } from "./channel";
import { ChannelIsNotDefined } from "./exceptions";
import { BaseProtocolDefination } from "./protocol_definition";
import { Address, IProtocolDefinition, IProviderAdapter, ISession, ProviderRequestMethodArguments, SubscriptionCallback } from "./types";

/**
 * ChainAdapters wrap individual setup and method calls for different chains
 * to one plug&play class.
 * 
 * The Base class will later be extended for creating method wrappers such as
 * Account methods, Transaction methods, etc.
 * Each ChainMethodAdapter will have their own implementation of common methods with
 * description input and output typing along with extended set of un-common methods
 * 
 * Initialisation with channel
 * 
 * const chainAdapter = new BaseChainAdapter({channel: new BaseProviderChannel(...)}) 
 * chainAdapter.request(...)
 * 
 */


interface IChainAdapterOptions {
    channel: BaseProviderChannel,
    protocolDefination?: BaseProtocolDefination,
    onConnect?: (options?: any) => void
}
export class BaseChainAdapter implements IProviderAdapter {

    public static providerPath = null;

    public get providerPath(): string { return (this.constructor as any).providerPath }

    protected _channel: BaseProviderChannel;
    public protocol?: IProtocolDefinition;

    // Allow high-order classes to easily differentiate between an instance and class
    public static isAdapterClass = true;

    public accounts?: Address[];
    public chainId?: number;
    public networkId?: number;



    public channelConnect?: (options?: any) => Promise<void>;
    public channelCheckSession?: (session: any) => Promise<[boolean, unknown]>;
    public channelbindSessionListener?: () => void;

    public channelOnConnect?: (options?: any) => void;

    public channelPing?: (options?: any) => Promise<boolean>;


    public onConnectCallback?: (options?: any) => void;

    public getProvider<T = any>(): T {
        if(this.channel === undefined || this.channel.provider === undefined) throw new Error("No connection exists");
        return this.channel.provider as T;
    }


    public get channel(): BaseProviderChannel { return this._channel }

    public set channel(_channel: BaseProviderChannel) { this._channel = _channel }


    isConnected(): boolean {
        return this._channel !== undefined && this._channel.isConnected;
    }


  


    public bindChannelDelegations(): void {
        let self = this;
        if (this.channel instanceof BrowserProviderChannel) {
            this.channel.providerPath = this.providerPath;
        }

        this.channelOnConnect = function (options?: any): void {
            if(self.onConnectCallback !== undefined){
                self.onConnectCallback({
                    data: options,
                    accounts: options.accounts ?? self.accounts,
                    chainId: options.chainId ?? self.chainId
                });
            }
        }

        this.channelPing = async (options?: any): Promise<boolean> => {
            const accounts = await self.getAccounts();
            self.accounts = accounts;
            const chainId = await self.getChainId();
            self.chainId = chainId;
            return true;
        }
    }

    async getAccounts(): Promise<Address[]> {
        throw new Error("Method not implemented")
    }

    async getChainId(): Promise<number> {
        throw new Error("Method not implemented")
    }

    constructor(options: IChainAdapterOptions) {
        this.channel = options.channel;
        if(options.protocolDefination !== undefined ){
            this.bindProtocol(options.protocolDefination);
        }
        this.onConnectCallback = options.onConnect;
        this.checkChannel()
        this.bindChannelDelegations();
    }
    getSession(): ISession {
        let sesion = this.channel.getCompleteSessionForStorage();
        if(this.chainId !== undefined){
            sesion["chainId"] = this.chainId
        }
        return sesion;
    }
    
    bindProtocol(protocol: IProtocolDefinition): void {
        this.protocol = protocol;
        // this.protocol.bindAdapter(this);
    }

    async checkSession<P>(): Promise<[boolean, P]> {
        this.checkChannel()
        return await this.channel.checkSession(this)
    }

    async connect(options?: any): Promise<void> {
        this.checkChannel()
        await this.channel.connect(options, this)

    }

    protected checkChannel(): void {
        if (this.channel === undefined) throw new ChannelIsNotDefined(this.constructor.name);
    }

    async request<T = any>(data: ProviderRequestMethodArguments, timeout?: number): Promise<T> {
        this.checkChannel();
        return await this.channel.request<T>(data, timeout);
    }


    async checkConnection(): Promise<boolean> {
        return await this.channel.checkConnection(this);
    }

    on(event: string, callback: SubscriptionCallback): void {
        if (this.channel === undefined) throw new ChannelIsNotDefined(this.constructor.name)
        this.channel.on(event, callback);
    }
}

export class EthereumChainAdapter extends BaseChainAdapter {

    public static providerPath = "ethereum";

}



