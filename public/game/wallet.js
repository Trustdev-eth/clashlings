import {getWallets} from '@wallet-standard/app';
import {base64url,unb64,encode58} from '../../lib/security.js';
let chosen=null,account=null,relay=null;
export function availableWallets(){return getWallets().get().filter(w=>w.features['standard:connect']&&w.features['solana:signMessage']).map(w=>({name:w.name,icon:w.icon,wallet:w}));}
export async function connectStandard(wallet){const result=await wallet.features['standard:connect'].connect();const next=result.accounts.find(a=>a.chains.some(c=>c.startsWith('solana:'))&&a.features.includes('solana:signMessage'));if(!next)throw new Error('Choose a Solana account that can sign messages.');chosen=wallet;account=next;return next.address;}
export async function connectRelay(projectId,onUri){
 if(!projectId)throw new Error('WalletConnect is not configured yet. Choose an installed wallet.');
 const {default:UniversalProvider}=await import('@walletconnect/universal-provider');relay??=await UniversalProvider.init({projectId,metadata:{name:'Clashlings',description:'Market-powered creature battles',url:location.origin,icons:[location.origin+'/icon.svg']}});
 relay.on('display_uri',onUri);let session;try{session=relay.session||await relay.connect({namespaces:{solana:{chains:['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],methods:['solana_signMessage','solana_signAndSendTransaction'],events:['accountsChanged','chainChanged']}}});}finally{relay.off('display_uri',onUri);}
 const caip=session?.namespaces?.solana?.accounts?.[0];if(!caip)throw new Error('No Solana account was selected.');account={address:caip.split(':').at(-1),chain:caip.slice(0,caip.lastIndexOf(':'))};chosen='relay';return account.address;
}
export async function signLogin(challenge){
 if(!account||account.address!==challenge.address)throw new Error('Connect the wallet shown in this sign-in request.');
 const message=new TextEncoder().encode(challenge.message);
 if(chosen==='relay'){const result=await relay.request({method:'solana_signMessage',params:{message:encode58(message),pubkey:account.address}},account.chain);const {decode58}=await import('../../lib/security.js');return base64url(decode58(result.signature));}
 if(!chosen)throw new Error('Connect your wallet again.');
 const [result]=await chosen.features['solana:signMessage'].signMessage({account,message});if(!result?.signature||result.signedMessage.length!==message.length||result.signedMessage.some((v,i)=>v!==message[i]))throw new Error('The wallet returned an unsupported sign-in format.');return base64url(result.signature);
}
export async function sendTransaction(proposal){
 if(!account||!chosen)throw new Error('Connect your signed-in wallet first.');
 if(proposal.chain!=='solana:mainnet')throw new Error('Unsupported transaction network.');
 if(Date.now()>proposal.expiresAt)throw new Error('This transaction request expired. Start again.');
 if(chosen==='relay'){const result=await relay.request({method:'solana_signAndSendTransaction',params:{transaction:proposal.transaction,sendOptions:{skipPreflight:false,preflightCommitment:'confirmed'}}},account.chain);return result.signature;}
 const feature=chosen.features['solana:signAndSendTransaction'];if(!feature)throw new Error('This wallet cannot send Solana transactions.');
 const [result]=await feature.signAndSendTransaction({account,chain:'solana:mainnet',transaction:unb64(proposal.transaction),options:{commitment:'finalized',preflightCommitment:'confirmed'}});return encode58(result.signature);
}
export async function disconnectWallet(){try{if(chosen==='relay')await relay?.disconnect();else await chosen?.features['standard:disconnect']?.disconnect();}finally{chosen=null;account=null;}}
export const currentWallet=()=>account?.address||null;
