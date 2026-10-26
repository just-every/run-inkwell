import { createFileRoute } from '@tanstack/react-router'
import { appStyles } from '../ui/styles'
import { EmbeddedApp } from '../ui/embedded-app'
export const Route=createFileRoute('/embed/$id')({head:()=>({meta:[{title:'Inkwell · Embedded session'},{name:'referrer',content:'no-referrer'}],links:appStyles}),component:EmbeddedApp})
