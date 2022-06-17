import { BaseConnector } from "@almight-sdk/connector";
import { authAxiosInstance, projectAxiosInstance } from "@almight-sdk/core";
import { BaseStorageInterface, Providers, WebLocalStorage } from "@almight-sdk/utils";
import { InvalidProjectIdError, StorageIsNotConnected } from "./exceptions";
import { BaseOriginFrameCommunicator } from "./frame_communicator";
import { IdentityResolver, IDENTITY_RESOLVERS } from "./resolver";
import { AllowedQueryParams, AuthenticationRespondStrategy, IAuthenticationDelegate, UserRegistrationArgument, UserRegistrationResult } from "./types";


export interface AuthenticationDelegateInitArgs {
    [AllowedQueryParams.Provider]?: string;
    [AllowedQueryParams.RespondStrategy]?: AuthenticationRespondStrategy;
    // Replacement code for JWT of user similar to ProjectIdentifier
    // It can only be generated by JWT to register/update new provider
    [AllowedQueryParams.UserIdentifier]?: string;
    // In-case of re-authentication
    // Address along with UserIdentifier is required for re-authentication
    // While every unique_id like email_id, username, publicKey will be called as address
    [AllowedQueryParams.Address]?: string;
}



export class AuthenticationDelegate implements IAuthenticationDelegate {

    respondStrategy: AuthenticationRespondStrategy;
    identityResolver?: IdentityResolver;
    respondFrame: BaseOriginFrameCommunicator;


    protected _state: Record<string, string> = {};


    readonly frozenStateKey = "frozen_auth_delegate"

    // States that are by default excluded from verification of state
    // They can be stored in state but won't be verified for a match
    // Most of them are generated params, that are generated by the process
    readonly verificationExcludedStates: string[] = [AllowedQueryParams.Code,
    AllowedQueryParams.Error,
    AllowedQueryParams.ErrorCode,
    ];

    // Query Parameters of url that can appear in a response url types
    // Respose urls are final stage urls from which results will be deduced
    // And then responded back to the origin
    readonly responseQueryParams: string[] = [];

    public static identityResolverMap: Record<string, IdentityResolver> = IDENTITY_RESOLVERS;
    public static respondStrategyMap: Record<string, BaseOriginFrameCommunicator> = {
    }

    connector?: BaseConnector;

    public storage: BaseStorageInterface;

    constructor(options?: {
        storage?: BaseStorageInterface,
        respondFrame?: BaseOriginFrameCommunicator,
        respondStrategy?: AuthenticationRespondStrategy,

    }) {
        // if (!isWebPlatform()) {
        //     throw new IncompatiblePlatformForAuthenticationDelegate();
        // }
        if (options !== undefined) {
            this.storage = options.storage ?? new WebLocalStorage();
            this.respondFrame = options.respondFrame;

            this.respondStrategy = options.respondStrategy;


        }
        const call = async () => {
            // (this.storage as any).prefix = "authentication"
            await this.storage.connect();
            // await this.captureUriData();
        }
        call();
    }


    async clean(): Promise<void> {
        if (await this.storage.isConnected()) {
            for (const query of Object.values(AllowedQueryParams)) {
                await this.storage.removeItem(query);
            }
        }
    }

    async close(): Promise<void> {
        await this.clean();
        if (await this.storage.hasKey("walletconnect")) {
            await this.storage.removeItem("walletconnect");
        }
        if (this.respondFrame !== undefined) {
            await this.respondFrame.close()
        }

    }


    public getTokenHeaders(tokens: { projectIdentifier?: string, userIdentifier?: string }): Record<string, string> {
        const headers = {};
        if (tokens.projectIdentifier !== undefined) {
            headers["X-PROJECT-IDENT"] = tokens.projectIdentifier
        }
        if (tokens.userIdentifier !== undefined) {
            headers["X-USER-IDENT"] = tokens.userIdentifier
        }
        return headers

    }


    redirectTo(uri: string): void {
        // globalThis.location.replace(uri);
        throw new Error("Method not implemented")
    }

    /**
     * Initialisation of Authentication Delegate with IdentityResolver and others
     * This method will mount required properties such as @property identityResolver
     * or @property respondStrategy. Along with this, the method will also create
     * a in-memory state of all the args in order to revive the exact class on page redirect
     * 
     * The state will be directly saved into the storage as frozen object, in order to change 
     * any of these state values one will need to create the new instance
     * 
     * @param args 
     */
    init(args: AuthenticationDelegateInitArgs): void {
        for (const [key, value] of Object.entries(args)) {

            switch (key) {
                case AllowedQueryParams.Provider:
                    if (this.identityResolver === undefined) {
                        this.identityResolver = (this.constructor as any).identityResolverMap[value];
                    }

                    if (this.identityResolver !== undefined) this.identityResolver.delegate = this;
                    break;
                case AllowedQueryParams.RespondStrategy:
                    if (this.respondStrategy === undefined) {
                        this.respondStrategy = value;
                    }
                    if (this.respondFrame === undefined) {
                        this.respondFrame = (this.constructor as any).respondStrategyMap[this.respondStrategy as string];
                    }

                    break;
                default:
                    this.storage.setItem(key, value);
                    break;



            }
            this._state[key] = value;
            this.setStates(this._state);
        }

    }



    async registerUser<T = UserRegistrationArgument>(data: T, tokens: { project_identifier: string, token?: string }): Promise<UserRegistrationResult> {
        const headers: Record<string, string> = this.getTokenHeaders({
            projectIdentifier: tokens.project_identifier,
            userIdentifier: tokens.token
        })
        const res = await authAxiosInstance.post<UserRegistrationResult>("/token", data, { headers: headers });
        return res.data;
    }



    async handleUserRegistration(): Promise<UserRegistrationResult> {
        if (!(await this.storage.hasKey(AllowedQueryParams.ProjectId))) throw new Error("Project Identifier is not provided");
        const data = await this.identityResolver?.getUserRegistrationArguments();
        const tokens: { project_identifier: string, token?: string } = {
            [AllowedQueryParams.ProjectId]: await this.storage.getItem<string>(AllowedQueryParams.ProjectId) as string,
        }
        const userIdentifier = await this.storage.getItem<string>(AllowedQueryParams.UserIdentifier);
        if (userIdentifier !== null) {
            tokens[AllowedQueryParams.UserIdentifier] = userIdentifier;
        }
        return await this.registerUser<typeof data>(data, tokens);

    }


    async verifyProject(projectIdentifier: string): Promise<boolean> {
        const url = encodeURI(`/project/ident`);
        const res = await projectAxiosInstance.get<{ is_verified: boolean }>(url, {
            headers: {
                "X-PROJECT-IDENT": projectIdentifier
            }
        });
        return res.data.is_verified === true;
    }

    async setStates(data: Record<string, any>): Promise<void> {
        if (await this.storage.isConnected()) {
            for (const [key, value] of Object.entries(data)) {
                await this.storage.setItem(key, value);
            }
        }
    }




    async verifyStates(states: Record<string, string>): Promise<boolean> {
        if (await this.storage.isConnected()) {
            for (const [key, value] of Object.entries(states)) {
                if ((!this.verificationExcludedStates.includes(key)) && (!(await this.storage.hasKey(key)) || JSON.stringify((await this.storage.getItem(key))) !== JSON.stringify(value))) {
                    return false
                }
            }
            return true;
        }
        return false;
    }


    public errorRedirect(error: string, errorCode?: number): void {

        // this.redirectTo(encodeURI(`/?${AllowedQueryParams.Error}=${error}&${AllowedQueryParams.ErrorCode}=${errorCode}`))
        throw new Error("Method to be implemented")
    }

    /**
     * Get configuration data from query param or stored data
     */
    async getConfigurationData(): Promise<Record<string, string>> {

        throw new Error("Method not implemneted")
    }


    async captureData(): Promise<void> {
        let query = await this.getConfigurationData();

        if (await this.storage.hasKey("walletconnect")) {
            await this.storage.removeItem("walletconnect");
        }

        if (query[AllowedQueryParams.ProjectId] !== undefined) {
            // Verify the project through the project id
            try {
                const res = await this.verifyProject(query[AllowedQueryParams.ProjectId]);
                if (!res) {
                    throw new InvalidProjectIdError(query[AllowedQueryParams.ProjectId]);
                }
                // Save the project id in the storage for future use
                this.storage.setItem(AllowedQueryParams.ProjectId, query[AllowedQueryParams.ProjectId]);
            } catch (_) {
                let _e = new InvalidProjectIdError(query[AllowedQueryParams.ProjectId]);
                this.errorRedirect(_e.message, 100000);

            }
        }
        this.init(query);
        // Identity Resolver is defined then process will depend upon resolver
        if (this.identityResolver !== undefined) {
            this.identityResolver.delegate = this;
            return await this.identityResolver.captureUri(query);
        }
    }


    async freeze(): Promise<void> {
        await this.setStates({ [this.frozenStateKey]: this._state });
    }


    async getState<T>(key: string): Promise<T> {
        if (!await this.storage.isConnected()) throw new StorageIsNotConnected();
        return await this.storage.getItem<T>(key) as T;
    }


    public static async fromFrozenState(): Promise<AuthenticationDelegate> {
        const delegate = new AuthenticationDelegate();
        const states = await delegate.getState<AuthenticationDelegateInitArgs>(delegate.frozenStateKey);
        delegate.init(states);
        return delegate;

    }


}



export class Web3AuthenticationDelegate extends AuthenticationDelegate {


    override async getConfigurationData(): Promise<Record<string, string>> {
        const data = {};
        for (const query of Object.values(AllowedQueryParams)) {
            const _value = await this.storage.getItem<string>(query)
            if (_value !== null && _value !== undefined) {
                data[query] = _value
            }
        }
        return data
    }
}



export class Web2AuthenticationDelegate extends AuthenticationDelegate {

    /**
     * URL location https://example.com/page?q1=v1&q2=v2
     * q1,q2 are query params and the function is responsible to return them as
     * {q1: v1, q2: v2}
     * 
     * @returns Record of query params
     */
    override async getConfigurationData(): Promise<Record<string, string>> {
        const params = new URLSearchParams(globalThis.location.search);
        let query: Record<string, string> = {}
        for (const [param, value] of params) {
            query[param] = decodeURIComponent(value)
        }
        return query;
    }

    async getOAuthUrl(provider: Providers | string, projectIdentifier: string): Promise<{ url: string, verifiers: Record<string, string> }> {
        const res = await authAxiosInstance.get<{ url: string, verifiers: Record<string, string> }>(`/provider/url/${provider}`, {
            headers: this.getTokenHeaders({ projectIdentifier: projectIdentifier })
        });
        return res.data;

    }



    override redirectTo(uri: string): void {
        globalThis.location.replace(uri);
    }
}