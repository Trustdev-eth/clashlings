import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameSiteOrigin} from '../lib/security.js';

test('sameSiteOrigin treats localhost and 127.0.0.1 as one local host',()=>{
 assert.equal(sameSiteOrigin('http://localhost:5173','http://127.0.0.1:5173'),true);
 assert.equal(sameSiteOrigin('http://127.0.0.1:5173','http://localhost:5173'),true);
 assert.equal(sameSiteOrigin('http://localhost:5173','http://localhost:5173'),true);
 assert.equal(sameSiteOrigin('http://localhost:5173','http://127.0.0.1:3000'),false);
 assert.equal(sameSiteOrigin('http://localhost:5173','https://localhost:5173'),false);
 assert.equal(sameSiteOrigin('http://localhost:5173','https://clashlings.example'),false);
 assert.equal(sameSiteOrigin('https://clashlings.example','https://evil.test'),false);
 assert.equal(sameSiteOrigin('https://clashlings.example','https://clashlings.example'),true);
 assert.equal(sameSiteOrigin('', 'http://localhost:5173'),false);
 assert.equal(sameSiteOrigin(null,'http://localhost:5173'),false);
});
