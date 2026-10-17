import type {ReactNode} from 'react';

/** Keep an explanation and its related actions together at every viewport size. */
export function WorkspaceNotice({title,children,actions,tone='info'}:{title?:string;children:ReactNode;actions?:ReactNode;tone?:'info'|'warning'|'error'}){
 return <div className={`workspace-notice notice-${tone}`} role={tone==='error'?'alert':undefined}>
  <div className="notice-copy">{title&&<strong>{title}</strong>}<p>{children}</p></div>
  {actions&&<div className="notice-actions">{actions}</div>}
 </div>;
}
