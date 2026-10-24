'use client';
import type {ReactNode} from 'react';
import {useSidebar} from '@/components/ui/sidebar';
// Close the mobile sheet before navigation or a separate dialog takes focus.
export function WorkspaceSidebarActions({children}:{children:ReactNode}){
 const {isMobile,setOpenMobile}=useSidebar();
 return <div className="workspace-sidebar-actions" onClickCapture={event=>{const target=event.target;if(isMobile&&target instanceof Element&&target.closest('button:not([data-sidebar="trigger"])'))setOpenMobile(false)}}>{children}</div>;
}
