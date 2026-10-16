import {loadAdapterEnv} from './env.mjs';
import {createAdapter} from './server.mjs';

loadAdapterEnv();
const port=Number(process.env.PORT||8788);
if(!process.env.CONTRACT_ADAPTER_KEY)console.warn('CONTRACT_ADAPTER_KEY is empty; signed adapter routes will be rejected.');
if(!process.env.GAME_TOKEN_MINT)console.warn('GAME_TOKEN_MINT is not set.');
const server=createAdapter(process.env);
server.listen(port,'127.0.0.1',()=>console.log(`Clashlings contract adapter listening on http://127.0.0.1:${port}`));
