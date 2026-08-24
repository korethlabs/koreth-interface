'use client';

import {useState} from 'react';
import {useAccount, useWriteContract, usePublicClient} from 'wagmi';
import {erc20Abi, type Abi, type Address} from 'viem';

interface ApproveStep {
  token: Address;
  spender: Address;
  amount: bigint;
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
 * A single button that runs an optional ERC20 approval and then the main call, back-to-back, on one
 * click. Approval is for the exact amount needed.
 *
 * The allowance is read when the button is clicked, not taken from the caller. It decides whether to
 * spend one of the user's confirmations, and the answer has to be about the chain as it is at the
 * moment they ask — a value captured at render is one the caller polled at some earlier block, and
 * acting on it either sends an approval that was not needed or skips one that was.
 */
export function ActionButton({approve, address, abi, functionName, args, label, disabled, onConfirmed}: Props) {
  const {writeContractAsync} = useWriteContract();
  const publicClient = usePublicClient();
  const {address: account} = useAccount();
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');

  async function run() {
    if (!publicClient || !account) return;
    setError('');

    async function sendApproval(amount: bigint) {
      const hash = await writeContractAsync({
        address: approve!.token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [approve!.spender, amount],
      });
      await publicClient!.waitForTransactionReceipt({hash});
    }

    try {
      if (approve) {
        const allowance = await publicClient.readContract({
          address: approve.token,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account!, approve.spender],
        });
        if (allowance < approve.amount) {
          setStep('approving');
          // USDT and the tokens modelled on it reject an approval written over a non-zero
          // allowance. An approval whose main call never landed leaves one behind, and every later
          // attempt at a larger amount then reverts inside the token — the user is locked out of
          // the action until they clear the allowance somewhere else. Which is exactly the branch
          // this is in: the allowance is short, so it has to be raised, and raising it is what the
          // token refuses. Cleared first, and only when there is something to clear — the reset is
          // a wallet confirmation of its own, and asking for one on every approval spends the
          // user's attention on a state they are usually not in.
          if (allowance > 0n) {
            await sendApproval(0n);
          }
          await sendApproval(approve.amount);
        }
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
