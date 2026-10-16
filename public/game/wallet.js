import {getWallets} from '@wallet-standard/app';
import {base64url,unb64,encode58} from '../../lib/security.js';
let chosen=null,account=null,relay=null;
const CHAINS=new Set(['solana:mainnet','solana:devnet','solana:testnet','solana:localnet']);
const CHAIN_ALIASES={
 'solana:mainnet':['solana:mainnet','solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
 'solana:devnet':['solana:devnet','solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'],
 'solana:testnet':['solana:testnet','solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z'],
 'solana:localnet':['solana:localnet']
};
export function chainAliases(chain='solana:mainnet'){
 const wanted=typeof chain==='string'&&chain.startsWith('solana:')?chain:'solana:'+(chain||'mainnet');
 for(const [caip,aliases] of Object.entries(CHAIN_ALIASES))if(caip===wanted||aliases.includes(wanted))return aliases;
 return CHAINS.has(wanted)?[wanted]:CHAIN_ALIASES['solana:mainnet'];
}
function clusterName(chain='solana:mainnet'){return (chainAliases(chain)[0]||'solana:mainnet').slice(7);}
function walletChain(wanted, supported){
 const aliases=chainAliases(wanted);
 if(!supported?.length)return aliases[0];
 return aliases.find(c=>supported.includes(c))||aliases[0];
}
function explainWalletError(error, chain){
 const msg=error?.message||String(error||'Wallet request was cancelled.');
 if(/chain ID does not match/i.test(msg))return new Error('Phantom is on the wrong network. Switch it to '+clusterName(chain)+' (Settings → Developer Settings), then approve again.');
 return error instanceof Error?error:new Error(msg);
}
function pickAccount(accounts, chain){
 const aliases=chainAliases(chain),solana=(accounts||[]).filter(a=>a.chains?.some(c=>c.startsWith('solana:'))&&a.features.includes('solana:signMessage'));
 return solana.find(a=>a.chains.some(c=>aliases.includes(c)))||solana[0]||null;
}
function walletConnectChain(chain){return chainAliases(chain).find(c=>c.split(':')[1]?.length>20)||chainAliases(chain)[0];}
export function availableWallets(){return getWallets().get().filter(w=>w.features['standard:connect']&&w.features['solana:signMessage']).map(w=>({name:w.name,icon:w.icon,wallet:w}));}
export async function connectStandard(wallet, chain='solana:mainnet'){
 const feature=wallet.features['standard:connect'];
 let result;try{result=await feature.connect({chains:chainAliases(chain)});}catch{result=await feature.connect();}
 const next=pickAccount(result.accounts,chain);if(!next)throw new Error('Choose a Solana account that can sign messages.');chosen=wallet;account=next;return next.address;
}
export async function connectRelay(projectId,onUri,chain='solana:mainnet'){
 if(!projectId)throw new Error('WalletConnect is not configured yet. Choose an installed wallet.');
 const {default:UniversalProvider}=await import('@walletconnect/universal-provider');relay??=await UniversalProvider.init({projectId,metadata:{name:'Clashlings',description:'Market-powered creature battles',url:location.origin,icons:[location.origin+'/icon.svg']}});
 const wc=walletConnectChain(chain);
 relay.on('display_uri',onUri);let session;try{session=relay.session||await relay.connect({namespaces:{solana:{chains:[wc],methods:['solana_signMessage','solana_signAndSendTransaction'],events:['accountsChanged','chainChanged']}}});}finally{relay.off('display_uri',onUri);}
 const caip=session?.namespaces?.solana?.accounts?.[0];if(!caip)throw new Error('No Solana account was selected.');account={address:caip.split(':').at(-1),chain:caip.slice(0,caip.lastIndexOf(':')),chains:[caip.slice(0,caip.lastIndexOf(':'))]};chosen='relay';return account.address;
}
export async function signLogin(challenge){
 if(!account||account.address!==challenge.address)throw new Error('Connect the wallet shown in this sign-in request.');
 const message=new TextEncoder().encode(challenge.message),wanted=challenge.chain||'solana:mainnet';
 try{
  const chain=walletChain(wanted,account.chains);
  if(chosen==='relay'){const result=await relay.request({method:'solana_signMessage',params:{message:encode58(message),pubkey:account.address}},chain);const {decode58}=await import('../../lib/security.js');return base64url(decode58(result.signature));}
  if(!chosen)throw new Error('Connect your wallet again.');
  const [result]=await chosen.features['solana:signMessage'].signMessage({account,message,chain});if(!result?.signature||result.signedMessage.length!==message.length||result.signedMessage.some((v,i)=>v!==message[i]))throw new Error('The wallet returned an unsupported sign-in format.');return base64url(result.signature);
 }catch(e){throw explainWalletError(e,wanted);}
}
export async function sendTransaction(proposal){
 if(!account||!chosen)throw new Error('Connect your signed-in wallet first.');
 const wanted=proposal.chain||'solana:mainnet';
 if(!CHAINS.has(wanted))throw new Error('Unsupported transaction network.');
 if(Date.now()>proposal.expiresAt)throw new Error('This transaction request expired. Start again.');
 try{
  const chain=walletChain(wanted,account.chains);
  if(chosen==='relay'){const result=await relay.request({method:'solana_signAndSendTransaction',params:{transaction:proposal.transaction,sendOptions:{skipPreflight:false,preflightCommitment:'confirmed'}}},chain);return result.signature;}
  const feature=chosen.features['solana:signAndSendTransaction'];if(!feature)throw new Error('This wallet cannot send Solana transactions.');
  const [result]=await feature.signAndSendTransaction({account,chain,transaction:unb64(proposal.transaction),options:{commitment:'finalized',preflightCommitment:'confirmed'}});return encode58(result.signature);
 }catch(e){throw explainWalletError(e,wanted);}
}
export async function disconnectWallet(){try{if(chosen==='relay')await relay?.disconnect();else await chosen?.features['standard:disconnect']?.disconnect();}finally{chosen=null;account=null;}}
export const currentWallet=()=>account?.address||null;
