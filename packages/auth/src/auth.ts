import { BaseConnector, IDENTITY_PROVIDERS, ISession, BaseChainAdapter, IdentityProvider, ConnectorType } from "@almight-sdk/connector";
import { AlmightClient, authAxiosInstance, projectAxiosInstance } from "@almight-sdk/core";
import { BaseStorageInterface, Class, META_DATA_SET, Providers } from "@almight-sdk/utils";
import { AuthenticationFrame, Web3NativeAuthenticationFrame } from "./frames";
import { IAuthenticationApp, ResponseMessageCallbackArgument, UserData, ErrorResponseMessageCallbackArgument, IAuthenticationFrame, AllowedQueryParams, ServerSentIdentityProvider, CurrentSessionStruct, ProviderConfiguration } from "./types";



export interface AuthenticationAppConstructorOptions {
    almightClient: AlmightClient;
    frame?: AuthenticationFrame;
    onSuccessCallback?: (data: ResponseMessageCallbackArgument) => void;
    onFailureCallback?: (data: ErrorResponseMessageCallbackArgument) => void;
    baseAuthenticaionURL?: string;
    configs?: ProviderConfiguration;
}

export class AuthenticationApp implements IAuthenticationApp {



    core: AlmightClient;
    frame?: IAuthenticationFrame;
    storage: BaseStorageInterface;
    connector?: BaseConnector;
    sessions: ISession[] = [];
    baseAuthenticationURL: string = "http://localhost:3000"
    token?: string;
    readonly configs?: ProviderConfiguration;

    readonly userKeyName = "almight_user";
    readonly userIdpsName = "almight_user_idps";
    readonly currentSessionName = "almight_connector_current_session"
    readonly AUTH_HEADER_KEY = "AUTHORIZATION"

    onSuccessCallback: (data: ResponseMessageCallbackArgument) => void;
    onFailureCallback: (data: ErrorResponseMessageCallbackArgument) => void;



    public set onSuccess(fn: (data: ResponseMessageCallbackArgument) => void) {
        this.onSuccessCallback = fn;
    }

    public set onFailure(fn: (data: ErrorResponseMessageCallbackArgument) => void) {
        this.onFailureCallback = fn;
    }

    setFrame(frame?: IAuthenticationFrame): void {
        if (frame !== undefined) {
            this.frame = frame;
            this.frame.app = this;
        }
    }


    getFrame(provider: string): IAuthenticationFrame {
        const idp = IDENTITY_PROVIDERS[provider];
        return new this.webVersionFrameMap[idp.webVersion](this.configs);
    }

    webVersionFrameMap: Record<number, Class<IAuthenticationFrame>> = {
        3: Web3NativeAuthenticationFrame
    }

    deadFunction(data?: any): any { }



    constructor(options: AuthenticationAppConstructorOptions) {
        this.core = options.almightClient;
        this.storage = this.core.storage;
        this.setFrame(options.frame);
        this.onSuccessCallback = options.onSuccessCallback ?? this.deadFunction;
        this.onFailureCallback = options.onFailureCallback ?? this.deadFunction;
        this.baseAuthenticationURL = options.baseAuthenticaionURL ?? this.baseAuthenticationURL;
        this.configs = options.configs;

        // TODO: need the below line to load token as variable from localstorage [JUST FOR TESTING]
        this.storage.getItem<string>("auth_token").then((token) => { this.token = token })
    }



    async getToken(token?: string): Promise<string> {
        if (token !== undefined && token !== null) return token;
        if (this.token !== undefined && this.token !== null) return this.token;
        return await this.storage.getItem<string>("fbid")
    }


    async isAuthenticated(): Promise<boolean> {

        try {
            const user = await this.getUserData();
            if (user.user !== undefined && user.user.user_id !== undefined) {
                await this.saveUserData(user);
                await this.setupConnector();
                return true
            }

        } catch (e) {

        }
        return false;


    }



    async verifyToken(token: string): Promise<boolean> {
        const res = await authAxiosInstance.post("/verify", { "token": this.token });
        return res.status === 200
    }




    async storeJWTToken(token: string): Promise<void> {
        await this.convertTokenToCookie(token)
        this.token = token;
        //TODO: Need cover aspects of react native
    }


    async getIdpsFromStore(): Promise<ServerSentIdentityProvider[]> {
        return await this.storage.getItem<ServerSentIdentityProvider[]>(this.userIdpsName);
    }

    async saveUserData(user: UserData): Promise<void> {
        await this.storage.setItem(this.userKeyName, user.user);
        await this.storage.setItem(this.userIdpsName, user.idps);
        await this.setCurrentSession(user.user.current_session);
    }



    async convertTokenToCookie(token: string): Promise<void> {
        await projectAxiosInstance.post("/cooking", {
            "type": "jwt",
            "token": token
        })
    }


    async getProjectIdentifier(): Promise<string> {
        return await this.core.getProjectIdentifier();
    }


    async getUserIdentifier(user_id?: string, token?: string): Promise<string> {

        user_id = user_id ?? (await this.getUserData()).user.user_id;
        if (user_id === undefined) throw new Error("No user is defined")

        const res = await authAxiosInstance.post<{ identifier: string }>("/user/ident", {
            "user_id": user_id
        }, {
            headers: this.getAuthenticationHeaders(token)
        }
        )
        return res.data.identifier;
    }

    getAuthenticationHeaders(token?: string): Record<string, string> {
        token = token ?? this.token;
        return (token === undefined && token !== null) ? {} : {
            [this.AUTH_HEADER_KEY]: `Bearer ${token}`
        }
    }

    async getUserData(token?: string): Promise<UserData> {
        const res = await authAxiosInstance.get<{ data: UserData }>("/me", {
            headers: this.getAuthenticationHeaders(token)
        });
        return res.data.data
    }


    async startAuthentication(provider: Providers): Promise<void> {
        this.setFrame(this.getFrame(provider));
        const projectIdentifier = await this.getProjectIdentifier();
        const data = {
            [AllowedQueryParams.ProjectId]: projectIdentifier,
            [AllowedQueryParams.Provider]: provider,

        }
        if (await this.isAuthenticated()) {
            data[AllowedQueryParams.UserIdentifier] = await this.getUserIdentifier()
        }
        this.frame.initAuth(data);
    }
    /**
     * In case of web3 session data, update the current session on server
     * Fetch new User data and setup connector
     * 
     * 
     * @param data 
     */
    async setCurrentSession<S = ISession>(data: CurrentSessionStruct<S>): Promise<void> {
        await this.storage.setItem(this.currentSessionName, data);
        await this.setupConnector();
    }

    async updateCurrentSession(data: CurrentSessionStruct, token?: string): Promise<UserData>{
        const res = await authAxiosInstance.post<{data: UserData}>("/me", {"current_session": data}, {
            headers: this.getAuthenticationHeaders(await this.getToken(token))
        })
        if (res.status === 200){
            this.saveUserData(res.data.data);
        }
        return res.data.data;
    }


    getIconAndNameForProvider(provider: Providers | string, connectorType?: ConnectorType | string): { icon: string, name: string } | undefined {
        const data = META_DATA_SET[provider];
        if (data === undefined) return undefined;
        let icon = data.icon;
        if (connectorType !== undefined) {
            switch (connectorType) {
                case ConnectorType.WalletConnector:
                    icon = META_DATA_SET["walletconnect"].icon;
                    break;
            }
        }
        return { icon: icon, name: data.name };
    }


    getCurrentSessionStructsFromIdp(idp: ServerSentIdentityProvider): CurrentSessionStruct[] {
        const cSessions = [];
        for (const [connectorType, sessions] of Object.entries(idp.sessions)) {
            for (const session of sessions) {
                const cSess: CurrentSessionStruct = {
                    uid: idp.uid,
                    provider: idp.provider,
                    connector_type: connectorType as ConnectorType,
                    session: session

                };
                cSessions.push(cSess);
            }
        }
        return cSessions;
    }



    async getAccountIdpsAsCurrentSessionStructs(): Promise<CurrentSessionStruct[]> {
        if (!await this.storage.hasKey(this.userIdpsName)) return [];
        let cSessions = []
        const idps: ServerSentIdentityProvider[] = await this.getIdpsFromStore();
        for (const idp of idps) {
            const cSess = this.getCurrentSessionStructsFromIdp(idp);
            cSessions = cSessions.concat(cSess);
        }
        return cSessions;
    }




    async setupConnector(): Promise<void> {
        const currentSession = await this.getCurrentSession();
        const idp: IdentityProvider = IDENTITY_PROVIDERS[currentSession.provider]
        const adapterClass = idp.getAdapterClass() as Class<BaseChainAdapter>;
        for (const channelClass of idp.getChannels()) {
            if ((channelClass as any).connectorType === currentSession.connector_type) {
                const channel = new channelClass(currentSession.session);
                const adapter = new adapterClass({
                    channel: channel
                });
                adapter.accounts = [currentSession.uid]
                adapter.chainId = (currentSession.session as any).chainId
                this.connector = new BaseConnector({ adapter: adapter });
                await this.connector.adapter.connect();
                return;
            }
        }
    }



    async getCurrentSession<S = ISession>(): Promise<CurrentSessionStruct<S>> {
        return await this.storage.getItem<CurrentSessionStruct<S>>(this.currentSessionName);
    }



}