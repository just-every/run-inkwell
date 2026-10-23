import { createFileRoute } from '@tanstack/react-router'
import { appStyles } from '../ui/styles'
import { PublicForm } from '../ui/public-form'
export const Route=createFileRoute('/form/$id')({head:()=>({meta:[{title:'Inkwell · Public signing form'},{name:'referrer',content:'no-referrer'}],links:appStyles}),component:()=>{const {id}=Route.useParams();return <PublicForm id={id}/>}})
