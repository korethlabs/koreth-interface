'use client';

import {useEffect} from 'react';
import {useWriteContract, useWaitForTransactionReceipt} from 'wagmi';
import type {Abi} from 'viem';

interface TxButtonProps {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  label: string;
  disabled?: boolean;
  onConfirmed?: () => void;
}

/** A button that sends one contract write and surfaces pending/confirming/success/error inline. */
export function TxButton({address, abi, functionName, args, label, disabled, onConfirmed}: TxButtonProps) {
  const {writeContract, data: hash, isPending, error, reset} = useWriteContract();
  const {isLoading: confirming, isSuccess} = useWaitForTransactionReceipt({hash});

  useEffect(() => {
    if (isSuccess) {
      onConfirmed?.();
      reset();
    }
  }, [isSuccess, onConfirmed, reset]);

  const busy = isPending || confirming;

  return (
    <div className="flex flex-col gap-1">
      <button
        disabled={disabled || busy}
        onClick={() => writeContract({address, abi, functionName, args})}
        className="btn-primary px-4 py-2 text-sm whitespace-nowrap"
      >
        {isPending ? 'Confirm in wallet…' : confirming ? 'Confirming…' : label}
      </button>
      {error && <span className="text-xs text-red-400">{error.message.split('\n')[0]}</span>}
    </div>
  );
}
