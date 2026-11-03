import MarketingPreference from '../../marketing/preferences';
export const metadata={title:'Confirm your subscription | Ferroworks',referrer:'no-referrer'};
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){const {token}=await searchParams;return <MarketingPreference token={typeof token==='string'&&token.length<1000?token:''} mode="confirm"/>;}
