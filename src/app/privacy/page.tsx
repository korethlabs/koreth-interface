import { LegalPage } from '@/components/LegalPage';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How Koreth Labs handles information in connection with the Services.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 27, 2026">
      <p>
        This Privacy Policy explains how Koreth Labs (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;) handles information in connection with the koreth.finance website and the
        Koreth interface (the &ldquo;Services&rdquo;). Because the Koreth Protocol is decentralized and
        non-custodial, we do not collect your private keys and never take custody of your funds.
      </p>

      <h2>1. Information we process</h2>
      <ul>
        <li>
          <strong>On-chain data.</strong> Public blockchain data — such as wallet addresses and
          transactions — is inherently public. When you connect a wallet, we may read publicly available
          on-chain information to display your positions and market data.
        </li>
        <li>
          <strong>Technical data.</strong> Our servers may automatically log standard technical
          information (e.g., IP address, browser type, and timestamps) for security, diagnostics, and to
          keep the Services reliable.
        </li>
        <li>
          <strong>Communications.</strong> If you contact us (e.g., by email), we process the
          information you choose to share.
        </li>
      </ul>
      <p>
        We do not ask for, and you should never provide, your private keys or seed phrase.
      </p>

      <h2>2. How we use information</h2>
      <ul>
        <li>to provide, operate, secure, and improve the Services;</li>
        <li>to prevent fraud, abuse, and security incidents;</li>
        <li>to comply with applicable legal obligations.</li>
      </ul>

      <h2>3. Sharing</h2>
      <p>
        We do not sell your personal information. We may share limited information with service providers
        that help us operate the Services (e.g., infrastructure and RPC providers), and where required by
        law or to protect our rights. Blockchain networks and third-party wallets you use are operated by
        others and governed by their own policies.
      </p>

      <h2>4. Cookies</h2>
      <p>
        The Services use only the cookies or local storage strictly necessary to function (for example,
        remembering your wallet-connection preference). We do not use them to build advertising profiles.
      </p>

      <h2>5. Data retention &amp; security</h2>
      <p>
        We retain technical logs only as long as needed for the purposes above and apply reasonable
        safeguards to protect information. No method of transmission or storage is completely secure.
      </p>

      <h2>6. Your rights</h2>
      <p>
        Depending on your jurisdiction, you may have rights to access, correct, or delete certain
        information we hold about you. Note that we cannot alter or delete data recorded on public
        blockchains, which are outside our control.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update this Policy from time to time. Material changes take effect when posted here.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about privacy? Contact us at{' '}
        <a href="mailto:legal@koreth.finance">legal@koreth.finance</a>.
      </p>
    </LegalPage>
  );
}
