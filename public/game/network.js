import {unpackPacket} from './wire.js';
import {SnapshotBuffer} from './snapshots.js';
export class ArenaConnection {
 constructor({call,id,onSnapshot=()=>{},onStatus=()=>{},onPending=()=>{},onRtt=()=>{},WebSocketImpl=globalThis.WebSocket}){this.call=call;this.id=id;this.onSnapshot=onSnapshot;this.onStatus=onStatus;this.onPending=onPending;this.onRtt=onRtt;this.WebSocketImpl=WebSocketImpl;this.buffer=new SnapshotBuffer();this.pending=[];this.closed=false;this.reading=false;this.sending=false;this.pollTimer=null;this.retryTimer=null;this.pingTimer=null;this.socket=null;this.ackWait=null;this.generation=0;this.rtt=null;}
 sampleRtt(ms){if(!Number.isFinite(ms)||ms<0||ms>5000)return;this.rtt=this.rtt===null?ms:this.rtt*.8+ms*.2;this.onRtt(this.rtt);}
 start(initial){this.realtime=initial.transport==='realtime';this.buffer.delay=this.realtime?150:120;this.buffer.maxExtrapolate=this.realtime?100:220;this.accept(initial);if(this.realtime)this.connect(initial.connection);else this.poll();}
 accept(packet){if(this.closed||!packet?.state)return;if(this.buffer.push(packet)){this.onSnapshot(packet);this.onStatus(this.realtime?'Live connection':'HTTP connection');}}
 sample(now){return this.buffer.sample(now);}
 async poll(){if(this.closed||this.realtime||this.reading)return;this.reading=true;try{const sent=performance.now(),packet=await this.call('match/'+this.id);this.sampleRtt(performance.now()-sent);this.accept(packet);}catch{this.onStatus('Reconnecting…');}finally{this.reading=false;if(!this.closed)this.pollTimer=setTimeout(()=>this.poll(),80);}}
 async connect(connection){
  if(this.closed)return;const generation=++this.generation;this.onStatus('Connecting…');
  try{connection??=await this.call('match/'+this.id+'/ticket',{});if(this.closed||generation!==this.generation)return;const ws=this.socket=new this.WebSocketImpl(connection.url);let reconnecting=false;
   const reconnect=()=>{if(reconnecting||this.closed||generation!==this.generation)return;reconnecting=true;this.socket=null;clearInterval(this.pingTimer);this.ackWait?.reject(new Error('Connection interrupted.'));this.ackWait=null;this.onStatus('Reconnecting…');this.retryTimer=setTimeout(()=>this.connect(),1000);};
   const ping=()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'ping',at:performance.now()}));};
   ws.onopen=()=>{if(this.closed){ws.close();return;}this.onStatus('Live connection');ping();clearInterval(this.pingTimer);this.pingTimer=setInterval(ping,2000);this.flush();};
   ws.onmessage=event=>{let data;try{data=unpackPacket(JSON.parse(event.data));}catch{return;}if(data.type==='pong'){this.sampleRtt(performance.now()-data.at);return;}if(data.state)this.accept(data);if((data.type==='ack'||data.type==='error')&&this.ackWait?.id===data.actionId){if(data.retry)this.ackWait.reject(new Error(data.error));else this.ackWait.resolve(data);this.ackWait=null;}};
   ws.onclose=reconnect;ws.onerror=()=>{try{ws.close();}catch{}reconnect();};
  }catch{if(!this.closed){this.onStatus('Reconnecting…');this.retryTimer=setTimeout(()=>this.connect(),1500);}}
 }
 command(action){if(this.closed)return Promise.reject(new Error('This match has closed.'));if(this.pending.length>=4)return Promise.reject(new Error('Your previous moves are still being confirmed.'));const command={...action,actionId:action.actionId||crypto.randomUUID()};return new Promise((resolve,reject)=>{this.pending.push({command,resolve,reject,tries:0});this.onPending(this.pending.map(x=>x.command));this.flush();});}
 async transmit(command){
  if(this.realtime&&this.socket?.readyState===1){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(this.ackWait?.id===command.actionId)this.ackWait=null;reject(new Error('Command acknowledgement delayed.'));},4500);this.ackWait={id:command.actionId,resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};this.socket.send(JSON.stringify(command));});}
  return this.call('match/'+this.id+'/'+command.type,command);
 }
 async flush(){
  if(this.closed||this.sending||!this.pending.length)return;this.sending=true;const item=this.pending[0];
  try{const packet=await this.transmit(item.command);if(this.closed)return;this.pending.shift();item.resolve(packet);this.accept(packet);this.onPending(this.pending.map(x=>x.command));}
  catch(error){if(this.closed)return;if(error.status&&error.status!==409&&error.status!==429&&error.status<500){this.pending.shift();item.reject(error);this.onPending(this.pending.map(x=>x.command));}else{item.tries++;this.onStatus('Confirming your move…');this.retryTimer=setTimeout(()=>this.flush(),Math.min(3000,300*2**Math.min(item.tries,4)));this.sending=false;return;}}
  this.sending=false;if(!this.closed)this.flush();
 }
 close(){if(this.closed)return;this.closed=true;this.generation++;clearTimeout(this.pollTimer);clearTimeout(this.retryTimer);clearInterval(this.pingTimer);this.ackWait?.reject(new Error('The match ended.'));this.ackWait=null;try{this.socket?.close();}catch{}for(const item of this.pending)item.reject(new Error('The match ended.'));this.pending=[];this.onPending([]);}
}
