'use client';
import {forwardRef,type ButtonHTMLAttributes,type ComponentPropsWithoutRef} from 'react';
export const GlassButton=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>>(function GlassButton({className='',children,type='button',...props},ref){
 return <button {...props} ref={ref} type={type} className={'glass-surface '+className}><span className="glass-surface-rim" aria-hidden="true"/>{children}</button>;
});
export function GlassPanel({className='',children,...props}:ComponentPropsWithoutRef<'article'>){
 return <article {...props} className={'glass-surface '+className}><span className="glass-surface-rim" aria-hidden="true"/>{children}</article>;
}
