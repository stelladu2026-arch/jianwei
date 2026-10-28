'use client';
import type {ReactNode} from 'react';
import {Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
export function WorkspaceToolsDrawer({title,description,label,children}:{title:string;description:string;label:ReactNode;children:ReactNode}){
 return <Sheet><SheetTrigger asChild><button type="button" className="button secondary workspace-tools-trigger">{label}<span aria-hidden="true">↗</span></button></SheetTrigger><SheetContent className="workspace-tools-drawer research-typesetting" side="right"><SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader><div className="workspace-tools-body">{children}</div></SheetContent></Sheet>;
}
