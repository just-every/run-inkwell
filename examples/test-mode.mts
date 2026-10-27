import {testExample as exercise} from './test-mode.mjs'
import type {Definition} from '../sdk/javascript/index.mjs'
export async function testExample(origin:string,key:string,definition:Definition,templateId:string){return exercise(origin,key,definition,templateId)}
