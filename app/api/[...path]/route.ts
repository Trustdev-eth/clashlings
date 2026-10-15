import { env } from 'cloudflare:workers';
import { api } from '../../../lib/backend.js';
export const dynamic='force-dynamic';
export async function GET(request:Request){return api(request,env);}
export async function POST(request:Request){return api(request,env);}
