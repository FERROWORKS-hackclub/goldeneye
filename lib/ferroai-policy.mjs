export function canReadChat(user,chat){return !!chat&&(chat.user_id===user.id||user.role==='admin')}
export function canDeleteChat(user,chat){return !!chat&&chat.user_id===user.id}
