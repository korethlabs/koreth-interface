'use client';

import {useState} from 'react';
import {useWriteContract, usePublicClient} from 'wagmi';
import {erc20Abi, type Abi, type Address} from 'viem';

interface ApproveStep {
  token: Address;
  spender: Address;
  amount: bigint;
  allowance: bigint;
}

interface Props {
  /** If given and allowance < amount, an ERC20 approve(amount) is sent first, then the main tx. */
  approve?: ApproveStep;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  label: string;
  disabled?: boolean;
  onConfirmed?: () => void;
}

type Step = 'idle' | 'approving' | 'sending';

/**
 * A single button that runs an optional ERC20 approval and then the main call, back-to-back
 * (two wallet confirmations, one click). Approval is for the exact amount needed.
 */
export function ActionButton({approve, address, abi, functionName, args, label, disabled, onConfirmed}: Props) {
  const {writeContractAsync} = useWriteContract();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');

  async function run() {
    if (!publicClient) return;
    setError('');
    try {
      if (approve && approve.allowance < approve.amount) {
        setStep('approving');
        const hash = await writeContractAsync({
          address: approve.token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [approve.spender, approve.amount],
        });
        await publicClient.waitForTransactionReceipt({hash});
      }
      setStep('sending');
      const hash = await writeContractAsync({address, abi, functionName, args} as Parameters<typeof writeContractAsync>[0]);
      await publicClient.waitForTransactionReceipt({hash});
      onConfirmed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : String(e));
    } finally {
      setStep('idle');
    }
  }

  const busy = step !== 'idle';
  return (
    <div className="flex flex-col gap-1">
      <button disabled={disabled || busy} onClick={run} className="btn-primary px-4 py-2 text-sm whitespace-nowrap">
        {step === 'approving' ? 'Approving…' : step === 'sending' ? 'Confirming…' : label}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
