// Test process only: the server-only marker has no browser bundle in these Node API tests.
const Module=require('node:module'),original=Module._load;
Module._load=function(request,parent,isMain){if(request==='server-only')return {};return original.call(this,request,parent,isMain)};
