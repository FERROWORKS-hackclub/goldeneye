export function can(role, area, write=false) {
 if(role==='admin') return true;
 if(area==='users'||area==='audit') return false;
 if(['allocations'].includes(area)) return role==='finance';
 if(['quotes','orders'].includes(area)) return write ? role==='manager'||role==='finance' : ['manager','finance'].includes(role);
 if(['filament','jobs'].includes(area)) return write ? ['manager','member'].includes(role) : true;
 if(area==='transactions') return role==='finance';
 if(area==='links') return !write;
 if(area==='projects'||area==='tasks') return write ? role==='manager'||role==='member' : true;
 if(['bom','changes','firmware','test_runs','issues'].includes(area)) return write ? ['manager','member'].includes(role) : ['admin','manager','member','viewer'].includes(role);
 if(['bom','changes','firmware','test_runs','issues'].includes(area)) return write ? ['manager','member'].includes(role) : ['admin','manager','member','viewer'].includes(role);
 return false;
}
export function cents(value){ const n=Number(value); if(!Number.isFinite(n)||n<=0||Math.round(n*100)>100000000000) throw new Error('Enter a positive amount up to 1 billion'); return Math.round(n*100); }
