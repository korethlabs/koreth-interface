import { LegalPage } from '@/components/LegalPage';
import { links } from '@/lib/links';

export const metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about the Koreth protocol and interface.',
};

export default function FaqPage() {
  return (
    <LegalPage title="Frequently asked questions" draft={false}>
      <h3>What is Koreth?</h3>
      <p>
        Koreth is a non-custodial lending protocol that lets you use your DEX liquidity-provider (LP)
        positions as collateral to borrow stablecoins — while your LP keeps earning swap fees. It relies
        on a manipulation-resistant LP pricing oracle and an atomic liquidation engine.
      </p>

      <h3>Is Koreth custodial? Do you hold my funds?</h3>
      <p>
        No. You interact with the protocol&rsquo;s smart contracts directly from your own self-custodial
        wallet. Koreth Labs never takes custody of your assets or private keys.
      </p>

      <h3>Which LP positions can I use as collateral?</h3>
      <p>
        The interface currently supports Uniswap V2 and V3 positions. Support for additional DEXes (such
        as Curve, Aerodrome, and PancakeSwap) is planned.
      </p>

      <h3>What are the main risks?</h3>
      <p>
        Like any DeFi protocol, using Koreth carries risk: your position can be liquidated if its health
        factor falls too low, and smart-contract bugs, oracle failures, or extreme market moves can lead
        to loss of funds. Only use funds you can afford to lose and do your own research.
      </p>

      <h3>What is the &ldquo;Anvil&rdquo; network I&rsquo;m connecting to?</h3>
      <p>
        The current app runs against a local mainnet fork (chain id 1337) for testing — it mirrors real
        Ethereum mainnet state (pools, tokens) in a sandbox where test accounts are pre-funded. It is a
        preview environment, not production.
      </p>

      <h3>Is Koreth audited and production-ready?</h3>
      <p>
        Not yet. Koreth is pre-launch and unaudited. Do not use it with funds you cannot afford to lose
        until it has been audited and deployed to mainnet.
      </p>

      <h3>Where can I get help?</h3>
      <p>
        Join our community on{' '}
        <a href={links.discord} target="_blank" rel="noreferrer">
          Discord
        </a>{' '}
        for questions and support. You can also review the <a href="/terms">Terms of Service</a> and{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </LegalPage>
  );
}
