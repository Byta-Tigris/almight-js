import { BaseChainAdapter } from "../adapter";
import { WalletConnectChannel } from "../channel";
import { IProviderAdapter, BalanceReturnType, Address, ProviderChannelInterface, ConnectorType, ProviderRequestMethodArguments, AccountsReturnType, RequestReturnType, IProtocolDefinition } from "../types";
import { ethers, BigNumber } from "ethers";
import { ChannelIsNotDefined } from "../exceptions";
import { Providers } from "utils/lib";







export class EthereumAdapter extends BaseChainAdapter implements IProtocolDefinition {

    public static providerPath = "ethereum";

    provider: ethers.providers.Web3Provider;


    chainIds: number[];


    checkProvider(): boolean {
        if (this.channel === undefined || this.channel.provider === undefined) throw new ChannelIsNotDefined(this.channel.constructor.name);
        if (this.provider === undefined) throw new Error("Provider is not connected");
        return true;
    }



    override async checkConnection(): Promise<boolean> {
        const result = await super.checkConnection();

        if (this.channel.connectorType === ConnectorType.BrowserExtension) {
            this.channel.onConnect({
                accounts: this.accounts,
                chainId: this.chainId
            }, this)
        }
        return result;
    }

    public bindChannelDelegations(): void {
        super.bindChannelDelegations();
        let self = this;


        this.channelOnConnect = (optiopns?: any): void => {
            if (super.channelOnConnect !== undefined) super.channelOnConnect(optiopns);
            if (this.channel !== undefined) {
                this.provider = new ethers.providers.Web3Provider(this.channel as ethers.providers.ExternalProvider);
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




    async sendTransaction(data: ethers.providers.TransactionRequest): Promise<ethers.providers.TransactionResponse> {
        this.checkProvider();
        return await this.provider.getSigner().sendTransaction(data);
    }
    async signTransaction(data: ethers.providers.TransactionRequest): Promise<string> {
        this.checkProvider();
        return await this.provider.getSigner().signTransaction(data);
    }

    async signPersonalMessage(data: { message: string, address?: string }): Promise<string> {
        data.address = data.address ?? this.accounts[0];
        return await this.request<string>({
            method: "personal_sign",
            params: [data.message, data.address]
        });
    }


    async getNetworkId(): Promise<number> {
        try {
            const chainId = await this.request<string>({ method: "net_version", params: [] });
            return parseInt(chainId);
        } catch (e) {
            throw e;
        }
    }

    async getChainId(): Promise<number> {
        try {
            const chainId = await this.request<string>({ method: "eth_chainId", params: [] });
            return parseInt(chainId);
        } catch (e) {
            throw e;
        }
    }
    async getAccounts(): Promise<Address[]> {
        return await this.request<Address[]>({
            method: "eth_accounts",
            params: []
        });
    }
    async getBalance(): Promise<BalanceReturnType> {
        const hexBalance = await this.request<string>({ method: "eth_getBalance", params: [this.accounts[0], "latest"] })
        const bNBalance = BigNumber.from(hexBalance);
        const balance = ethers.utils.formatEther(bNBalance);
        return parseFloat(balance);
    }
    async getTransactionCount(block: string = "latest"): Promise<number> {
        this.checkProvider()
        return await this.provider.getTransactionCount(this.accounts[0], block);
    }


}


export class MetaMaskAdapter extends EthereumAdapter {

    public static providerPath = "ethereum";

    adapter?: IProviderAdapter;
    chainIds: number[];


    verifyBrowserSession(provider: any): boolean {
        return (provider as any).isMetaMask === true;
    }



    public bindChannelDelegations(): void {
        super.bindChannelDelegations();
        let self = this;
        this.channelConnect = async (options?: any): Promise<void> => {
            await self.channel.defaultConnect(options, self)
            if (self.channel.connectorType === ConnectorType.WalletConnector) {
                await self.channel.defaultConnect(options, self);
                if ((self.channel as WalletConnectChannel).isSessionConnected()) await self.checkConnection();
                return;
            }
            await self.channel.defaultConnect(options, self)
            self.accounts = await self.request<Address[]>({ method: "eth_requestAccounts", params: [] });
            self.checkConnection();
        }
        this.channelCheckSession = async <P = any, S = any>(session: S, channel?: ProviderChannelInterface): Promise<[boolean, P]> => {
            let [isSessionValid, _provider] = await self.channel.defaultCheckSession(self);
            if (self.channel.connectorType === ConnectorType.BrowserExtension && isSessionValid && _provider !== undefined) {
                if((_provider as any).provider !== undefined && (_provider as any).providers.length > 1){
                    for(const provider of (_provider as any).providers){
                        if(this.verifyBrowserSession(provider)) return provider;
                    }
                }
                else if (this.verifyBrowserSession(_provider)) {
                    return [true, _provider];
                }
                return [false, undefined]
            }
            return [isSessionValid, _provider];

        }

    }

}

export class KardiaChainAdapter extends MetaMaskAdapter {

    public static providerPath = Providers.KardiaChain;

    override verifyBrowserSession(provider: any): boolean {
        return (provider as any).isKaiWallet === true
    }

}



export class CoinbaseWalletAdapter extends MetaMaskAdapter {

    override verifyBrowserSession(provider: any): boolean {
        return (provider as any).isCoinbaseWallet === true;
    }

}