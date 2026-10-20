export function jobCost(job) {
 const material = job.grams / 1000 * job.costPerKg;
 const electricity = job.hours * job.watts / 1000 * job.energyRate;
 const labour = job.labourHours * job.labourRate;
 const base = material + electricity + labour + job.overhead;
 const costCents = Math.round(base * 100);
 if(!Number.isSafeInteger(costCents)||!Number.isSafeInteger(Math.round(base*(1+job.markup/100)*100))||costCents<0)throw new Error('Invalid job cost');
 return {costCents, suggestedCents: Math.round(base * (1 + job.markup / 100) * 100), materialCents: Math.round(material * 100), electricityCents: Math.round(electricity * 100), labourCents: Math.round(labour * 100)};
}
export function dueState(due, status, now = new Date()) {
 if (['Done','Completed','Fulfilled','Cancelled','Accepted','Declined','Converted'].includes(status)) return '';
 const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const difference = (Date.parse(due) - Date.parse(day)) / 86400000;
 return difference < 0 ? 'Overdue' : difference === 0 ? 'Due today' : difference <= 7 ? 'Due soon' : '';
}
