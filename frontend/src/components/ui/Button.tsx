import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled,
  ...props
}: ButtonProps) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-colors focus:outline-none';
  
  const variants = {
    primary: 'bg-primary hover:bg-primary-hover text-white disabled:bg-gray-300 disabled:text-gray-500',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 disabled:bg-gray-100 disabled:text-gray-400',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 disabled:text-gray-400',
  };

  const sizes = {
    sm: 'h-9 px-4 text-sm',
    md: 'h-12 px-6 text-base',
    lg: 'h-14 px-8 text-lg font-bold',
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
