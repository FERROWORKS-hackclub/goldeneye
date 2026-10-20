import {createHash, randomBytes} from 'node:crypto';
export function inviteToken(){return randomBytes(32).toString('base64url');}
export function tokenHash(token){if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Invalid invitation');return createHash('sha256').update(token).digest('hex');}
export function inviteStatus(invite,now=new Date()){
 if(invite.revoked_at)return 'Revoked';const expires=new Date(invite.expires_at).getTime();return !Number.isFinite(expires)||expires<=now.getTime()?'Expired':'Active';
}
export function usableInvite(invite,now=new Date()){return !!invite&&inviteStatus(invite,now)==='Active'&&invite.issuer_active===true&&['admin','manager'].includes(invite.issuer_role);}
export function canReview(role){return ['admin','manager'].includes(role);}
export function canAssignRole(actorRole,role){return actorRole==='admin'?['member','viewer','manager','finance','admin'].includes(role):actorRole==='manager'&&['member','viewer'].includes(role);}
