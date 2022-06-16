import { BaseChainAdapter } from "../adapter";
import { BalanceReturnType, IProtocolDefinition, RequestReturnType, SignMessageArgument, SignMessageReturnType, TransactionData, TransactionReturnType } from "../types";


export class SolanaChainAdapter extends BaseChainAdapter implements IProtocolDefinition {
    chainIds: number[];
    sendTransaction(data: TransactionData): Promise<TransactionReturnType> {
        throw new Error("Method not implemented.");
    }
    signTransaction(data: TransactionData): Promise<TransactionReturnType> {
        throw new Error("Method not implemented.");
    }
    signPersonalMessage(data: SignMessageArgument): Promise<SignMessageReturnType> {
        throw new Error("Method not implemented.");
    }
    getNetworkId(): Promise<RequestReturnType> {
        throw new Error("Method not implemented.");
    }
    getBalance(): Promise<BalanceReturnType> {
        throw new Error("Method not implemented.");
    }
    getTransactionCount(): Promise<number> {
        throw new Error("Method not implemented.");
    }
}