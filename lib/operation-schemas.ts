import {z} from 'zod';
const text=z.string().trim().min(1).max(200);
const num=z.number().finite().min(0).max(1000000000);
const project=z.union([z.uuid(),z.literal('')]).default('');
export const operationSchemas={
 filament:z.object({name:text,material:text,color:text,remainingGrams:num,lowGrams:num,costPerKg:num,notes:z.string().max(2000).default('')}),
 jobs:z.object({name:text,projectId:project,filamentId:project,grams:num,hours:num,watts:num,energyRate:num,labourHours:num,labourRate:num,overhead:num,markup:num,costPerKg:num}),
 quotes:z.object({name:text,customer:text,email:z.union([z.email(),z.literal('')]).default(''),projectId:project,jobId:z.uuid(),quantity:z.number().int().min(1).max(100000),unitPrice:num,status:z.enum(['Draft','Sent','Accepted','Declined']),due:z.iso.date(),notes:z.string().max(2000).default('')}),
 orders:z.object({name:text,customer:text,email:z.union([z.email(),z.literal('')]).default(''),projectId:project,jobId:z.uuid(),quantity:z.number().int().min(1).max(100000),unitPrice:num,status:z.enum(['New','Printing','Ready','Fulfilled','Cancelled']),due:z.iso.date(),notes:z.string().max(2000).default('')}),
 allocations:z.object({name:text,projectId:z.uuid(),transactionId:z.string().regex(/^txn_[A-Za-z0-9]+$/)}),
 bom:z.object({name:text,partNumber:text,supplier:text,category:text,quantity:z.number().int().min(1).max(100000),unitCostUsd:num,leadTimeDays:z.number().int().min(0).max(3650),status:z.enum(['Design','Sourcing','Qualified','Production']),revision:text,notes:z.string().max(2000).default('')}),
 changes:z.object({name:text,changeId:text,owner:text,status:z.enum(['Proposed','Review','Approved','Implemented']),costDeltaUsd:z.number().finite().min(-1000000).max(1000000),due:z.iso.date(),affected:text,notes:z.string().max(2000).default('')}),
 firmware:z.object({name:text,version:text,channel:z.enum(['Alpha','Beta','Release']),status:z.enum(['Draft','Testing','Released','Withdrawn']),releasedOn:z.iso.date().or(z.literal('')),notes:z.string().max(3000).default('')}),
 test_runs:z.object({name:text,prototype:text,firmwareVersion:text,category:z.enum(['Print quality','Reliability','Safety','Usability','Performance']),status:z.enum(['Planned','Running','Passed','Failed','Blocked']),runDate:z.iso.date(),owner:text,notes:z.string().max(3000).default('')}),
 issues:z.object({name:text,prototype:text,severity:z.enum(['Low','Medium','High','Critical']),status:z.enum(['Open','Investigating','Fixed','Verified']),firmwareVersion:text,owner:text,notes:z.string().max(3000).default('')})
};
