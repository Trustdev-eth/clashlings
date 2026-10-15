import {clamp} from './math.js';
const smooth=(a,b,t)=>{const p=clamp((t-a)/(b-a),0,1);return p*p*(3-2*p);};
export const isCaster=id=>[1,3,6,7,9,11].includes(id);
export function combatTiming(event){return event.kind==='hit'?{delay:.085,impact:.20,life:.43,hold:event.card===5||event.card===8?.080:.055}:{delay:.12,impact:.38,life:.47,hold:.035};}
// Pose peaks follow release/contact times; variants alternate limbs and follow-through.
export function combatPose(id,elapsed,combo=0){
 const p={wind:0,strike:0,settle:0,x:0,y:0,z:0,pitch:0,twist:0,roll:0,head:0,jaw:0,arm:0,elbow:0,spread:0,tail:0,paw:0,phase:'idle'};
 if(elapsed<0||elapsed>.64)return p;
 const cast=isCaster(id),contact=cast?.15:.20,sign=combo%2?1:-1;
 p.wind=smooth(0,.075,elapsed)*(1-smooth(.075,contact,elapsed));p.strike=smooth(cast?.075:.10,contact,elapsed)*(1-smooth(contact+.045,.59,elapsed));p.settle=Math.sin(clamp((elapsed-contact)/(.64-contact),0,1)*Math.PI);
 p.phase=elapsed<.085?'anticipation':elapsed<contact?'strike':elapsed<contact+.065?'contact':'recovery';
 const w=p.wind,s=p.strike,r=p.settle;
 p.z=s*.20-w*.09;p.pitch=-w*.19+s*.22;p.head=-w*.18+s*.16;p.jaw=s*.16;p.paw=.6;
 if(id===1){p.y=-w*.065+Math.sin(clamp((elapsed-.08)/.30,0,1)*Math.PI)*(id===0?.28:.18);p.z=s*(id===0?.43:.28)-w*.12;p.twist=sign*(s*(combo%3===2?.95:.22)-w*.14);p.x=sign*s*.06;p.tail=sign*s*(combo%3===2?.85:.24);p.paw=1.3;p.jaw=s*.27;p.head=-w*.25+s*.25;}
 if(id===0){p.y=-w*.08-s*.035;p.z=s*.36-w*.12;p.pitch=-w*.16+s*.30;p.head=-w*.22+s*.32;p.twist=sign*s*.12;p.paw=.65;p.jaw=s*.15;p.tail=-sign*s*.14;}
 if(id===2){p.y=-w*.035-s*.03;p.z=s*.26-w*.08;p.pitch=-w*.12+s*.25;p.head=-w*.18+s*.40;p.twist=combo%3===2?sign*s*.45:sign*s*.07;p.paw=.35;p.jaw=s*.14;}
 if(id===3||id===6||id===9){p.z=-s*.08-w*.045;p.pitch=-s*.16;p.head=-w*.20+s*.14;p.twist=sign*(w*.24-s*.22);p.arm=-w*.65-s*1.25;p.elbow=-w*.55+s*.12;p.spread=w*.35+s*.16;p.y=w*.05+s*.035;p.jaw=s*.15;}
 if(id===4){p.y=w*.10-s*.25;p.z=s*.38-w*.10;p.pitch=-w*.20+s*.47;p.head=-w*.2+s*.28;p.jaw=s*.55;p.roll=sign*s*.15;}
 if(id===5){p.y=w*.10-s*.105+r*.025;p.z=s*.22-w*.06;p.pitch=-w*.28+s*.42;p.arm=-w*2.25-s*.36;p.elbow=-w*.72+s*.10;p.spread=w*.28+s*.20;p.twist=combo%3===2?0:sign*s*.20;p.head=-w*.15+s*.22;p.paw=.15;}
 if(id===7){p.y=w*.08-s*.05;p.z=-s*.12;p.pitch=-w*.18+s*.18;p.head=-w*.26+s*.25;p.jaw=w*.12+s*.62;p.tail=-sign*s*.30;p.spread=s*.12;}
 if(id===8){p.y=-w*.07-s*.05;p.z=s*.51-w*.14;p.pitch=-w*.12+s*.26;p.head=w*.12+s*.22;p.twist=sign*(s*.50-w*.18);p.paw=.75;p.jaw=s*.12;p.arm=-w*1.15-s*1.65;p.elbow=-w*.85+s*.30;p.spread=w*.20+s*.18;}
 if(id===10){p.y=s*.20-w*.05;p.z=s*.35-w*.10;p.pitch=s*.23-w*.2;p.twist=sign*s*.14;p.jaw=s*.3;}
 if(id===11){p.y=w*.14-s*.12;p.z=s*.21-w*.06;p.pitch=-w*.27+s*.34;p.head=-w*.2+s*.26;p.jaw=s*.35;p.roll=sign*s*.14;p.paw=.9;}
 return p;
}
