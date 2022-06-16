import { BaseStorageInterface, isWebPlatform } from "utils/lib";
import { projectAxiosInstance } from "./axios_clients";
import { InvalidAPIKey } from "./excpetions";
import { IAlmightClient } from "./types";

export interface AlmightClientConstructorOptions {
    apiKey: string;
    storage: BaseStorageInterface;
}
export class AlmightClient implements IAlmightClient {
  
    apiKey: string;
    storage: BaseStorageInterface;

    readonly projectPropertyKeyName = "almight_project"

    constructor(options: AlmightClientConstructorOptions){
        this.apiKey = options.apiKey;
        this.storage = options.storage;
        this.storage.connect().then();
    }


    async isAPIKeyValid(): Promise<boolean> {
        const res = await projectAxiosInstance.post<{is_valid: boolean}>("/project/verify/api_key",{
            "api_key": this.apiKey
        });
        return res.data.is_valid === true
    }

    async getProjectIdentifier(): Promise<string> {
        if(! await this.isAPIKeyValid()) throw new InvalidAPIKey()
        const res = await projectAxiosInstance.post<{identifier: string}>("/project/ident", {}, {
            headers: {
                "X-API-KEY": this.apiKey
            }
        });
        return res.data.identifier;
    }


}