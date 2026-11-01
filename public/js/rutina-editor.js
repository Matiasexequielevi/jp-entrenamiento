(()=>{'use strict';
const $=id=>document.getElementById(id), root=$('ejerciciosEditor'),form=$('rutinaForm');if(!root||!form)return;
const warm=$('calentamientoEditor'), fieldKeys=['nombre','series','repeticiones','peso','descanso','indicaciones'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let routines=[];try{routines=JSON.parse($('rutinasExistentes')?.textContent||'[]')}catch(e){console.error(e)}
function renumber(){[...root.children].forEach((el,i)=>{el.querySelector('.jp-edit-number').textContent=i+1})}
function btn(text,action){return `<button type="button" data-action="${action}">${text}</button>`}
function exercise(data={}){
 const card=document.createElement('div');card.className='jp-edit-exercise';if(data._id)card.dataset.id=String(data._id);
 card.innerHTML=`<div class="jp-edit-head"><strong>Ejercicio <span class="jp-edit-number"></span></strong><div class="jp-mini-actions">${btn('↑','up')}${btn('↓','down')}${btn('Quitar','remove')}</div></div>
 <label>Nombre del ejercicio</label><input data-key="nombre" maxlength="180" placeholder="Press banca" required>
 <div class="jp-fields"><div><label>Series</label><input data-key="series" type="number" min="0" max="100" inputmode="numeric"></div>
 <div><label>Repeticiones</label><input data-key="repeticiones" maxlength="50" placeholder="8 a 12"></div>
 <div><label>Peso</label><input data-key="peso" maxlength="50" placeholder="40 kg"></div>
 <div><label>Descanso</label><input data-key="descanso" maxlength="50" placeholder="60 seg"></div></div>
 <label>Bloque combinado (opcional)</label><select data-key="grupo"><option value="">Individual</option>${'ABCDEFGH'.split('').map(x=>`<option value="${x}">Bloque ${x}</option>`).join('')}</select>
 <small class="muted">Para combinar 2 o 3 ejercicios consecutivos, poneles la misma letra.</small>
 <label>Indicaciones</label><input data-key="indicaciones" maxlength="200" placeholder="Técnica, observaciones...">`;
 for(const k of [...fieldKeys,'grupo'])card.querySelector(`[data-key="${k}"]`).value=data[k]??'';
 card.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
 if(action==='remove'){if(root.children.length<=1)return alert('La rutina necesita al menos un ejercicio');card.remove()}
 if(action==='up'&&card.previousElementSibling)root.insertBefore(card,card.previousElementSibling);
 if(action==='down'&&card.nextElementSibling)root.insertBefore(card.nextElementSibling,card);
 renumber();});root.appendChild(card);renumber();return card;
}
function warming(data={}){
 const card=document.createElement('div');card.className='jp-warm-row';card.innerHTML=`<div class="jp-edit-head"><strong>🔥 Actividad inicial</strong><div class="jp-mini-actions">${btn('Quitar','remove')}</div></div><label>Actividad</label><input data-key="nombre" maxlength="180" placeholder="Bicicleta fija"><label>Duración</label><input data-key="duracion" maxlength="50" placeholder="5 minutos"><label>Indicaciones</label><input data-key="indicaciones" maxlength="200" placeholder="Ritmo suave">`;
 for(const k of ['nombre','duracion','indicaciones'])card.querySelector(`[data-key="${k}"]`).value=data[k]??'';
 card.addEventListener('click',e=>{if(e.target.closest('[data-action="remove"]'))card.remove()});warm.appendChild(card);
}
function values(card,keys){const out={};for(const k of keys)out[k]=card.querySelector(`[data-key="${k}"]`).value.trim();return out}
const crear=$('jpVistaCrear'),creadas=$('jpVistaCreadas');
function vista(tipo){const isCrear=tipo==='crear';crear.hidden=!isCrear;creadas.hidden=isCrear;
 $('jpTabCrear').classList.toggle('active',isCrear);$('jpTabCreadas').classList.toggle('active',!isCrear);
 $('jpTabCrear').setAttribute('aria-pressed',String(isCrear));$('jpTabCreadas').setAttribute('aria-pressed',String(!isCrear));}
const orden=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
function filter(){const selected=$('filtroRutinas').value,items=[...document.querySelectorAll('.jp-routine-item')];
 const seen=new Set();let count=0;
 items.sort((a,b)=>orden.indexOf(a.dataset.dia)-orden.indexOf(b.dataset.dia)).forEach(el=>{
  const key=el.dataset.alumno+'|'+el.dataset.dia;
  const show=!!selected&&el.dataset.alumno===selected&&!seen.has(key);
  el.hidden=!show;if(show){seen.add(key);count++;}
 });
 const list=$('listaRutinas');items.sort((a,b)=>orden.indexOf(a.dataset.dia)-orden.indexOf(b.dataset.dia)).forEach(el=>list.appendChild(el));
 $('jpRutinasVacio').hidden=!!selected&&count>0;
 $('jpRutinasVacio').textContent=selected?'Este alumno todavía no tiene rutinas cargadas.':'Seleccioná un alumno para ver sus rutinas.';
 $('jpResumenRutinas').hidden=!selected;
 if(selected)$('jpResumenRutinas').textContent=count+' día'+(count===1?'':'s')+' de entrenamiento cargado'+(count===1?'':'s')+'.';
}
$('filtroRutinas').addEventListener('change',filter);
$('jpTabCrear').addEventListener('click',()=>{reset();vista('crear')});
$('jpTabCreadas').addEventListener('click',()=>{vista('creadas');filter()});
function reset(){form.reset();$('rutinaId').value='';root.replaceChildren();warm.replaceChildren();exercise();
 $('modoRutina').textContent='Nueva rutina. Seleccioná un alumno, el día y agregá sus ejercicios.';
 $('jpTituloEditor').textContent='🏋️ Crear rutina';$('jpCancelarEdicion').hidden=true;}
$('jpCancelarEdicion').addEventListener('click',()=>{reset();vista('creadas');filter()});
function edit(id){const r=routines.find(x=>x._id===id);if(!r)return alert('Rutina no encontrada');
 $('rutinaId').value=r._id;$('rAlumno').value=r.alumno;$('rDia').value=r.dia;$('rTitulo').value=r.titulo;
 root.replaceChildren();warm.replaceChildren();(r.ejercicios||[]).forEach(exercise);(r.calentamiento||[]).forEach(warming);
 if(!root.children.length)exercise();$('modoRutina').textContent='✏️ Editando '+r.dia+' · '+r.titulo+'. Guardá los cambios al terminar.';
 $('jpTituloEditor').textContent='✏️ Editar rutina';$('jpCancelarEdicion').hidden=false;
 $('filtroRutinas').value=r.alumno;filter();vista('crear');
 document.querySelector('[data-teacher-tab="rutina"]')?.click();
 $('jpVistaCrear').scrollIntoView({behavior:'smooth',block:'start'});
}
document.querySelectorAll('.jp-edit-existing').forEach(b=>b.addEventListener('click',()=>edit(b.dataset.id)));
filter();
if(new URLSearchParams(location.search).has('rutina'))vista('creadas');
$('addEjercicio').addEventListener('click',()=>exercise().querySelector('[data-key="nombre"]').focus());
$('addCalentamiento').addEventListener('click',()=>warming());exercise();
form.addEventListener('submit',e=>{
 const ejercicios=[...root.children].map(el=>({...values(el,[...fieldKeys,'grupo']),...(el.dataset.id?{_id:el.dataset.id}:{})}));
 const calentamiento=[...warm.children].map(el=>values(el,['nombre','duracion','indicaciones']));
 if(!ejercicios.length||ejercicios.some(x=>!x.nombre)||calentamiento.some(x=>!x.nombre)){e.preventDefault();return alert('Completá los nombres de todos los ejercicios y calentamientos')}
 if(ejercicios.length>50||calentamiento.length>20){e.preventDefault();return alert('Máximo 50 ejercicios y 20 calentamientos')}
 const grupos={};ejercicios.forEach((x,i)=>{if(x.grupo)(grupos[x.grupo]??=[]).push(i)});
 if(Object.entries(grupos).some(([g,idx])=>idx.length<2||idx.length>3||idx.some((n,i)=>i&&n!==idx[i-1]+1))){e.preventDefault();return alert('Cada bloque combinado debe tener 2 o 3 ejercicios consecutivos con la misma letra')}
const actual = routines.find(x =>
  x.alumno === $('rAlumno').value &&
  x.dia === $('rDia').value
);

// Solo advertimos si estamos creando una rutina nueva
// o si estamos editando una rutina distinta.
if (actual && actual._id !== rutinaId) {
  const confirmar = confirm(
    'Ya existe una rutina para este alumno y día. ' +
    '¿Querés reemplazarla con los cambios actuales?'
  );

  if (!confirmar) {
    e.preventDefault();
    return;
  }
} if(actual&&!confirm('Ya existe una rutina para este alumno y día. ¿Guardar los cambios y reemplazar la versión actual?')){e.preventDefault();return}
 $('ejerciciosJson').value=JSON.stringify(ejercicios);$('calentaJson').value=JSON.stringify(calentamiento);
 $('ejerciciosPayload').value=ejercicios.map(x=>[x.nombre,x.series,x.repeticiones,x.descanso,x.peso,x.indicaciones].join(' | ')).join('\n');
});
})();