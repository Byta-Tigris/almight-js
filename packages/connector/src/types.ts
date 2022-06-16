import WalletConnect from "@walletconnect/client";
import { Class, Providers } from "@almight-sdk/utils";

export interface NetworkData {
    name?: string,
    chainId: number
}

export interface ISession { 
    chainId: number
}

export interface BrowserSessionStruct extends ISession { path: string, network?: NetworkData, chainId: number };

interface WalletConnectMetaInterface {
    description: string
    url: string
    icons: string[]
    name: string
    ssl?: boolean
}
export interface WalletConnectSessionStruct extends ISession {
    connected: boolean,
    accounts: Array<string>
    chainId: number
    bridge: string
    key: string
    clientId: string
    clientMeta: WalletConnectMetaInterface
    peerId: string
    peerMeta: WalletConnectMetaInterface
    handshakeId: number
    handshakeTopic: string
}

/**
 * Session structure formats used to save and load sessions
 * SDK is based on injection based browser provider and walletconnect provider
 * Single IdP can have many sessions and thus they required different procedure to load
 * based on the providers
 */
export interface ProviderSessionStruct {
    [ConnectorType.BrowserExtension]: Array<BrowserSessionStruct>;
    [ConnectorType.WalletConnector]: Array<WalletConnectSessionStruct>
}


export type ExternalProvider = BasicExternalProvider | WalletConnect | any;



export interface SessioUpdateArguments {
    accounts?: Address[];
    chainId?: number
}


export interface ProviderChannelInterface {


    connectorType: ConnectorType;
    requestTimeout: number;

    getCompleteSessionForStorage(): ISession;

    setProvider(provider: ExternalProvider): void;
    init(session?: IProviderSessionData): void;
    checkSession(obj?: IProviderAdapter): Promise<[boolean, any | null]>;
    checkEnvironment(): Promise<boolean>;
    connect(options?: any, obj?: IProviderAdapter): Promise<void>;
    onSessionUpdate(options?: SessioUpdateArguments): void;
    bindSessionListener(obj?: IProviderAdapter): void;
    defaultbindSessionListener(): void;
    checkConnection(obj?: IProviderAdapter): Promise<boolean>;
    ping(data?: { method?: string, obj?: IProviderAdapter }): Promise<boolean>;
    request<T = any>(data: ProviderRequestMethodArguments, timeout?: number): Promise<T>
    /**
     * Method to subscribe events 
     */
    on(name: string, callback: SubscriptionCallback): void;
}

export interface ProviderRequestMethodArguments {
    method: string
    params: any[] | object
}

export type BasicExternalProvider = {
    request: (args: ProviderRequestMethodArguments) => Promise<unknown>
    on(name: string, callback: (value: any) => void): void;
}

export type Address = string;

export type IProviderSessionData = BrowserSessionStruct | WalletConnectSessionStruct


export enum ConnectorType {
    BrowserExtension = "browser_extension",
    WalletConnector = "walletconnect"
}

export interface SubscriptionCallback {
   (...args: any[]): void;
}



export interface IProviderAdapter {


    getProvider<T = any>(): T;

    isConnected(): boolean;

    protocol?: IProtocolDefinition;

    bindProtocol(protocol: IProtocolDefinition): void;

    getSession(): ISession;

    channelConnect?: (options?: any) => Promise<void>;
    channelCheckSession?: (session: any) => Promise<[boolean, unknown]>;
    channelPing? :(options?: any) => Promise<boolean>;
    channelOnConnect?: (options?: any) => void;
    channelbindSessionListener?: () => void;
    on(event: string, callback: SubscriptionCallback): void;

    request<T>(data: ProviderRequestMethodArguments, timeout?: number): Promise<T>;

    checkSession<P>(): Promise<[boolean, P]>;
    connect(): Promise<void>;
}


export interface IChannelBehaviourPlugin {
    channelConnect?: <R = any>(options?: R, channel?: ProviderChannelInterface) => Promise<void>;
    channelCheckSession?: <P = any, S = any>(session: S, channel?: ProviderChannelInterface) => Promise<[boolean, P]>;
    channelOnConnect?: (options?: any, channel?: ProviderChannelInterface) => void;
    channelVerifyPingException?: (exception: Error, channel?: ProviderChannelInterface) => boolean;
    bind(channel: ProviderChannelInterface): void;

}

export interface IdentityProviderInterface {
    identityProviderName: string;
    webVersion: number;

    allowedConnectorTypes: Array<ConnectorType>;

    // chainId or unique id for web2 providers
    identifier: string | number | Providers;

    // Meta Datas such as icon, name, url , etc
    metaData: Record<string, any>;

    getAdapterClass(): Class<IProviderAdapter> | null;
    getChannels(): Class<ProviderChannelInterface>[];
    getProtocolDefination(): Class<IProtocolDefinition>;

}







export interface IConnectorSessionFilter {
    chainId?: number;
    path?: string;
    clientId?: string;
    peerId?: string;
    handshakeId?: number;
    handshakeTopic?: string;
}

export interface IConnectorConnectArguments {
    channel?: Class<ProviderChannelInterface> | ProviderChannelInterface;
    session?: BrowserSessionStruct | WalletConnectSessionStruct;
    filters?: IConnectorSessionFilter
}


export interface IConnector {

    findChannels(): Class<ProviderChannelInterface>[];
    findAdapter(): Class<IProviderAdapter>;
    connect(args: IConnectorConnectArguments): Promise<void>;
    getChannels(): Promise<Class<ProviderChannelInterface>[]>;
    getSessions(): ISession[];
    validateSessionStructure(session: BrowserSessionStruct | WalletConnectSessionStruct, filters: IConnectorSessionFilter): boolean;
    validateChannel(channel: Class<ProviderChannelInterface>): Promise<boolean>;
    validateChannelSession(channel: Class<ProviderChannelInterface>, session?: BrowserSessionStruct | WalletConnectSessionStruct): Promise<boolean>;


}

export interface TransactionData {}


export interface SignMessageArgument {}


export interface TransactionReturnType {}
export interface SignMessageReturnType {}
export interface AccountsReturnType {}
export interface BalanceReturnType {}
export interface RequestReturnType {}


export interface IProtocolDefinition {

    // adapter?: IProviderAdapter;
    chainIds: number[];

    // bindAdapter(adapter: IProviderAdapter): void;

    // request<T = any>(args: ProviderRequestMethodArguments): Promise<T>;

    sendTransaction(data: TransactionData): Promise<TransactionReturnType>;

    signTransaction(data: TransactionData): Promise<TransactionReturnType>;

    signPersonalMessage(data: SignMessageArgument): Promise<SignMessageReturnType>;


    getNetworkId(): Promise<RequestReturnType>;
    getChainId(): Promise<RequestReturnType>;
    getAccounts(): Promise<AccountsReturnType>;
    getBalance(): Promise<BalanceReturnType>;
    getTransactionCount(): Promise<number>;



}
