import { Class, META_DATA_SET, Providers } from "@almight-sdk/utils";
import { BaseChainAdapter } from "./adapter";
import { CoinbaseWalletAdapter, KardiaChainAdapter } from "./adapters";
import { MetaMaskAdapter } from "./adapters";
import { BaseProviderChannel, BrowserProviderChannel, WalletConnectChannel } from "./channel";
import { BaseProtocolDefination } from "./protocol_definition";
import { ConnectorType, IdentityProviderInterface, IProtocolDefinition, IProviderAdapter, ProviderChannelInterface } from "./types";

interface IdentityProviderConstructor { 
    name: string, 
    identifier: string
    webVersion: number, 
    allowedConnectorTypes?: ConnectorType[], 
    metaData?: Record<string, any>
    adapterClass: Class<BaseChainAdapter>,
    channels: Class<BaseProviderChannel>[],
    protocolDefinition?: Class<BaseProtocolDefination>;
}

export class IdentityProvider implements IdentityProviderInterface {
    identityProviderName: string;
    webVersion: number;
    allowedConnectorTypes: ConnectorType[];
    identifier: string | number;
    metaData: Record<string, any>;
    adapterClass: Class<BaseChainAdapter>;
    channels: Class<BaseProviderChannel>[];
    protocolDefinition?: Class<BaseProtocolDefination>;

    constructor({ allowedConnectorTypes = [], ...data }: IdentityProviderConstructor) {
        this.identityProviderName = data.name;
        this.identifier = data.identifier;
        this.webVersion = data.webVersion;
        this.allowedConnectorTypes = allowedConnectorTypes;
        this.metaData = data.metaData;
        this.adapterClass = data.adapterClass;
        this.channels = data.channels;
        this.protocolDefinition = data.protocolDefinition;
    }
    getProtocolDefination(): Class<IProtocolDefinition> {
        return this.protocolDefinition;
    }

    getAdapterClass(): Class<IProviderAdapter> {
        return this.adapterClass;
    }
    getChannels(): Class<BaseProviderChannel>[] {
        return this.channels;
    }

}


function getConfiguredWeb3IdentityProvider(provider: Providers,data: {adapterClass: Class<BaseChainAdapter>, channels?: Class<BaseProviderChannel>[], identifier?: string, allowedConnectorTypes?: ConnectorType[]}): IdentityProvider {
    return new IdentityProvider({
        name: META_DATA_SET[provider].name,
        allowedConnectorTypes: data.allowedConnectorTypes,
        webVersion:3,
        identifier: data.identifier ?? provider,
        metaData: META_DATA_SET[provider],
        adapterClass: data.adapterClass,
        channels: data.channels ?? [BrowserProviderChannel, WalletConnectChannel]
    });
}



const IDENTITY_PROVIDERS: Record<string, IdentityProvider> = {
    [Providers.MetaMask]: getConfiguredWeb3IdentityProvider(Providers.MetaMask, {adapterClass: MetaMaskAdapter}),
    [Providers.KardiaChain]: getConfiguredWeb3IdentityProvider(Providers.KardiaChain, {adapterClass: KardiaChainAdapter}),
    [Providers.Coinbase]: getConfiguredWeb3IdentityProvider(Providers.Coinbase, {adapterClass: CoinbaseWalletAdapter})

}

export {IDENTITY_PROVIDERS}