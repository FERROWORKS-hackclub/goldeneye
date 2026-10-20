import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isTrustedOrigin,primaryAppBaseUrl} from '../lib/trusted-origins.mjs';

test('multi-app base URLs allow only their exact trusted origins',()=>{
 const previous=process.env.APP_BASE_URL;
 process.env.APP_BASE_URL='https://goldeneye.ferroworks.org, https://ferroai.ferroworks.org,https://printerlab.ferroworks.org';
 try{
  assert.equal(primaryAppBaseUrl(),'https://goldeneye.ferroworks.org');
  for(const host of ['goldeneye','ferroai','printerlab'])assert.equal(isTrustedOrigin(`https://${host}.ferroworks.org`),true);
  for(const origin of ['https://ferroworks.org','https://other.ferroworks.org','http://ferroai.ferroworks.org','null','not a url',null])assert.equal(isTrustedOrigin(origin),false);
 }finally{if(previous===undefined)delete process.env.APP_BASE_URL;else process.env.APP_BASE_URL=previous;}
});
