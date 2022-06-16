import { BrowserProviderChannel, MetaMaskAdapter, WalletConnectChannel } from "@almight-sdk/connector";
import { useEffect } from "react";

import { expect } from "chai";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "@walletconnect/qrcode-modal"

const Channels: React.FC = () => {


    async function testBrowserPorivderChannelForNonExistingProvider(): Promise<void> {
        console.log("Testing BrowserProviderChannel for non-existing path");
        const path = "tetatris";
        const channel = new BrowserProviderChannel({ path: path, chainId: 1 });
        const [isSessionValid, provider] = await channel.checkSession();
        expect(isSessionValid).to.be.false;
        expect(provider).to.be.undefined;
    }



    async function testBrowserProviderChannel(): Promise<void> {
        console.log("Testing BrowserProviderChannel for ethereum metamask");

        await testBrowserPorivderChannelForNonExistingProvider()

        const path = "ethereum";
        if ((window as any)[path] === undefined) return;
        let channel = new BrowserProviderChannel({ path: path, chainId: 1 });
        let [isSessionValid, provider] = await channel.checkSession();
        expect(isSessionValid, "isSessionValid is false").to.true;
        expect(provider, "provider from checkSession is not equal to window.ethereum").to.equal((window as any)[path]);

        expect(await channel.checkEnvironment()).to.true;
        console.log("Testing connect");
        await channel.connect();
        expect(channel.provider).not.to.undefined;
        expect(channel.provider).to.be.equal((window as any)[path]);
        expect(channel.isConnected).to.be.true;

        console.log("Finished testing BrowserProviderChannel for metamask ");

    }

    // async function testWalletConnectChannelWithoutAnySession(): Promise<void> { }
    async function testWalletConnectChannelWithProvidedSession(): Promise<void> {
        
        console.log("Testing walletconnect with provided session")
        
        const session = { "connected": true, "accounts": ["0x994752691A7650Ca546839997B7F0a23ce333B36"], "chainId": 56, "bridge": "https://b.bridge.walletconnect.org", "key": "62073a4e3bd645efacb9e356b855931ed6d326ddac9798ccd73faa253a39eb4f", "clientId": "16526930-f361-4ebd-9e62-c880e32ba003", "clientMeta": { "description": "", "url": "http://localhost:3000", "icons": [], "name": "" }, "peerId": "6dfd98bf-6308-4490-8ad6-244425d284e3", "peerMeta": { "description": "MetaMask Mobile app", "url": "https://metamask.io", "icons": ["https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/metamask-fox.svg"], "name": "MetaMask", "ssl": true }, "handshakeId": 1655270601990759, "handshakeTopic": "1f2e96af-5e2b-47f0-b19a-30e33a80e6d3" }
        const channel = new WalletConnectChannel(session);
        expect(channel.session).not.to.undefined;
        expect(channel.isConnected).to.be.false;
        expect(channel.provider).to.be.undefined;

        expect((await channel.checkSession())[0]).to.be.true;

        await channel.connect();
        expect(channel.isConnected).to.be.true;
        expect(channel.provider).not.to.be.undefined;
        expect(channel.accounts.length).to.be.greaterThan(0)
    }
    async function testWalletConnectChannelWithExistingProviderInstance(): Promise<void> {
        console.log("Testing WalletConnectChannel with existing provider")
        const walletconnect = new WalletConnect({
            bridge: "https://bridge.walletconnect.org", // Required
            qrcodeModal: QRCodeModal,
        });
        const channel = new WalletConnectChannel();
        expect(channel.isConnected).to.be.false;
        expect(channel.session).to.be.undefined;
        expect(channel.provider).to.be.undefined;

        await channel.connect(walletconnect as any);        
        expect(channel.isConnected).to.be.true;
        expect(channel.provider).not.to.be.undefined;


    }





    async function testWalletConnectChannel(): Promise<void> {
        console.log("Testing WalletConnectChannel for ethereum metamask");
        await testWalletConnectChannelWithProvidedSession();
        await testWalletConnectChannelWithExistingProviderInstance();
        console.log("Finished testing WalletConnectChannel for metamask ");
    }


    async function testChannels(): Promise<void> {
        await testBrowserProviderChannel();
        await testWalletConnectChannel();
    }


    useEffect(() => {
        testChannels().then()

    }, [])


    return (
        <div></div>
    )
}


export default Channels;