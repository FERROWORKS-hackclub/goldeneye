export default {
 poweredByHeader:false,
 outputFileTracingIncludes:{'/api/ferrosign/templates':['./public/templates/weekly-worklog-template.pdf','./public/templates/weekly-worklog-template-setup.json']},
 async rewrites(){return {beforeFiles:[
  {source:'/',has:[{type:'host',value:'ferroai.ferroworks.org'}],destination:'/ferroai'},
  {source:'/',has:[{type:'host',value:'printerlab.ferroworks.org'}],destination:'/printer-lab'}
 ]};},
 async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}];}
};
