const form=document.querySelector('#form'), input=document.querySelector('#message'), status=document.querySelector('#status'), confirmBox=document.querySelector('#confirmation'), list=document.querySelector('#proposals');
form.addEventListener('submit',(event)=>{event.preventDefault();const text=input.value.trim();if(!text)return;status.textContent='thinking...';confirmBox.hidden=true;window.curieAsk.send(text);});
document.querySelector('#yes').addEventListener('click',()=>window.curieAsk.confirm(true));
document.querySelector('#no').addEventListener('click',()=>window.curieAsk.confirm(false));
document.querySelector('#close').addEventListener('click',()=>window.curieAsk.close());
document.addEventListener('keydown',(event)=>{if(event.key==='Escape')window.curieAsk.close();});
input.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
window.curieAsk.onUpdate((message)=>{status.textContent=message.text||'';if(message.clear){input.value='';input.focus();}});
window.curieAsk.onConfirmation((proposals)=>{list.replaceChildren(...proposals.map((proposal)=>{const item=document.createElement('li');item.textContent=proposal.label;return item;}));confirmBox.hidden=false;status.textContent='Confirm these changes?';});
