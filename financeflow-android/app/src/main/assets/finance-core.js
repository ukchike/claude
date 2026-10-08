(function(root){
  'use strict';
  const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function date(value){
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    const d=new Date(+m[1],+m[2]-1,+m[3]);
    return iso(d)===value?d:null;
  }
  function nextDue(value,frequency,anchor){
    const d=date(value),a=date(anchor||value);
    if(!d||!a)return null;
    if(frequency==='daily')d.setDate(d.getDate()+1);
    else if(frequency==='weekly')d.setDate(d.getDate()+7);
    else if(frequency==='monthly'||frequency==='yearly'){
      const year=d.getFullYear()+(frequency==='yearly'?1:0);
      const month=frequency==='monthly'?d.getMonth()+1:a.getMonth();
      const last=new Date(year,month+1,0).getDate();
      return iso(new Date(year,month,Math.min(a.getDate(),last)));
    }else return null;
    return iso(d);
  }
  function rate(account,primary){
    if(!account)return null;
    if((account.currency||primary)===primary)return 1;
    const r=Number(account.fxRate);
    return Number.isFinite(r)&&r>0&&(!account.fxBase||account.fxBase===primary)?r:null;
  }
  function amount(tx,accounts,primary){
    const a=accounts.find(a=>a.id===(tx.accountId||tx.fromAccountId));
    const r=rate(a,primary),n=Number(tx.amount);
    return r===null||!Number.isFinite(n)?null:round(n*r);
  }
  function sameCurrency(from,to,accounts,primary){
    const a=accounts.find(a=>a.id===from),b=accounts.find(a=>a.id===to);
    return !!a&&!!b&&from!==to&&(a.currency||primary)===(b.currency||primary);
  }
  function occurrences(template,today,existing){
    if(!template.active||!date(template.nextDue)||!date(today)||!Number.isFinite(Number(template.amount))||Number(template.amount)<=0)return [];
    const result=[],seen=new Set(existing.map(p=>p.occurrenceKey));
    const anchor=template.anchorDate||template.nextDue;
    let due=template.nextDue;
    for(let i=0;due<=today&&i<5000;i++){
      const key=template.id+'|'+due;
      if(!seen.has(key))result.push({...template,id:'due_'+key,templateId:template.id,occurrenceKey:key,date:due,status:'pending'});
      const next=nextDue(due,template.frequency,anchor);
      if(!next||next<=due)break;
      due=next;
    }
    return result;
  }
  function transferAmounts(amount,exchangeRate){
    const sent=round(Number(amount)),fx=Number(exchangeRate),received=round(sent*fx);
    if(!Number.isFinite(sent)||sent<=0||!Number.isFinite(fx)||fx<=0||!Number.isFinite(received)||received<=0)throw Error('Enter a positive amount and conversion rate.');
    return {amount:sent,receivedAmount:received,exchangeRate:fx};
  }
  const api={round,date,nextDue,rate,amount,sameCurrency,occurrences,transferAmounts};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FinanceCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
