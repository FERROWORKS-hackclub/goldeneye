import './globals.css';
import AccountEmailMigration from './account-email-migration';
export const metadata={title:'Goldeneye | Ferrowork',description:'Goldeneye: projects, print operations and finance for Ferrowork.'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}<AccountEmailMigration/></body></html>;}
