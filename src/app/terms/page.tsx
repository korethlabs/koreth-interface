import { LegalPage } from '@/components/LegalPage';

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms governing your use of the Koreth website and interface.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 27, 2026">
      <p>
        These Terms of Use (&ldquo;Terms&rdquo;) govern your access to and use of the koreth.finance
        website and the Koreth interface at app.koreth.finance (together, the &ldquo;Services&rdquo;),
        brought to you by Koreth Labs (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). The
        Services provide information about, and an interface to, the Koreth Protocol — a set of
        open-source, self-executing smart contracts deployed on permissionless public blockchains (the
        &ldquo;Protocol&rdquo;). Koreth Labs does not control or operate any version of the Protocol on
        any blockchain network.
      </p>
      <p className="uppercase text-sm">
        Arbitration notice: these Terms contain a binding arbitration clause and a class-action waiver
        (Section 9). Except as described there, you and we agree that disputes relating to the Services
        will be resolved by mandatory binding arbitration, and you waive any right to a jury trial or to
        participate in a class action.
      </p>

      <h2>1. Acceptance &amp; eligibility</h2>
      <p>
        By accessing or using the Services you enter into a binding agreement with us consisting of
        these Terms and the <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use the
        Services. You represent that you are legally able to enter into this agreement and are not
        barred from using the Services under the laws of any applicable jurisdiction. We may modify the
        Services or these Terms at any time; your continued use after changes take effect constitutes
        acceptance.
      </p>

      <h2>2. The Services</h2>
      <p>
        The Services are informational and provide one of several possible means of interacting with
        the Protocol through your own self-custodial wallet. We are not a party to any blockchain
        transaction, do not take custody or control of your cryptoassets or funds, and are not a broker,
        intermediary, agent, or fiduciary. You retain control of your assets at all times.
      </p>
      <ul>
        <li>
          <strong>Self-custodial wallets.</strong> You interact with the Protocol using a third-party
          wallet governed by its own terms; we do not control it and are not responsible for it.
        </li>
        <li>
          <strong>Network fees.</strong> Blockchain transactions may incur gas and protocol fees set
          and collected by third parties. Such fees may be non-refundable, including for failed or
          reverted transactions.
        </li>
        <li>
          <strong>Information only.</strong> Nothing in the Services is financial, investment, legal, or
          tax advice. Information may be inaccurate, incomplete, or outdated; rely on it at your own risk.
        </li>
      </ul>

      <h2>3. Assumption of risk</h2>
      <p>
        Smart contracts, cryptoassets, and related software are experimental and inherently risky. Bugs,
        exploits, cyberattacks, oracle failures, chain reorganizations or forks, and market volatility
        can result in the total loss of your cryptoassets. LP-collateral lending carries additional
        risks, including liquidation of your position. You are solely responsible for evaluating the
        Services and for the security of your wallet and private keys, which we never have access to. If
        you are not comfortable assuming these risks, do not use the Services.
      </p>

      <h2>4. Taxes</h2>
      <p>
        You are solely responsible for determining and paying any taxes, duties, or assessments that
        apply to your use of the Services or your cryptoasset transactions.
      </p>

      <h2>5. Ownership &amp; license</h2>
      <p>
        We grant you a personal, worldwide, revocable, non-exclusive, non-assignable license to use the
        Services as permitted by these Terms. We retain all right, title, and interest in the Services,
        except for open-source components released under their own licenses. Any feedback you provide may
        be used by us without obligation to you.
      </p>

      <h2>6. Prohibited use</h2>
      <p>You agree not to use the Services to:</p>
      <ul>
        <li>engage in or promote unlawful, fraudulent, or deceptive activity, money laundering, terrorist financing, or sanctions evasion;</li>
        <li>exploit, attack, or interfere with any smart contract, the Services, or other users;</li>
        <li>reverse engineer, scrape, or make unauthorized commercial use of the Services;</li>
        <li>circumvent security, access, geofencing, or usage restrictions.</li>
      </ul>
      <p>
        You may not use the Services if you are the subject of sanctions or are located in a
        comprehensively sanctioned jurisdiction. We may restrict or revoke access at our discretion where
        we suspect a violation of these Terms or applicable law.
      </p>

      <h2>7. Disclaimers &amp; limitation of liability</h2>
      <p className="uppercase text-sm">
        The Services are provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties
        of any kind, express or implied, including merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that the Services will be accurate, uninterrupted, secure, or
        error-free.
      </p>
      <p className="uppercase text-sm">
        To the maximum extent permitted by law, the Koreth Labs indemnified parties will not be liable
        for any indirect, incidental, special, consequential, exemplary, or punitive damages, or loss of
        profits, data, or goodwill. In no event will our cumulative liability to you from all claims
        exceed one thousand U.S. dollars (US $1,000.00).
      </p>

      <h2>8. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Koreth Labs and its affiliates, officers, and agents
        from any claim or demand (including reasonable legal fees) arising out of your breach of these
        Terms, your misuse of the Services, or your violation of any law or third-party right.
      </p>

      <h2>9. Dispute resolution &amp; arbitration</h2>
      <p>
        Before commencing any proceeding, you and we agree to attempt to resolve any dispute through good
        faith negotiation for at least ninety (90) days after written notice. Any dispute that cannot be
        resolved will be settled by binding arbitration under the International Arbitration Rules of the
        International Centre for Dispute Resolution, seated in the Cayman Islands, conducted in English.
        You and we waive any right to a jury trial and to participate in a class action or representative
        proceeding.
      </p>

      <h2>10. Termination</h2>
      <p>
        This agreement remains in effect until terminated. You may terminate by ceasing all use of the
        Services. We may suspend or terminate your access at any time, including where your use exposes us
        to risk or liability or violates these Terms. We may modify or discontinue the Services at any
        time without notice.
      </p>

      <h2>11. General</h2>
      <p>
        If any provision of these Terms is unenforceable, the remaining provisions remain in effect. We
        may assign these Terms; you may not without our consent. These Terms and the Privacy Policy are
        the entire agreement between you and us regarding the Services. These Terms are governed by the
        laws of the Cayman Islands.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms? Contact us at{' '}
        <a href="mailto:legal@koreth.finance">legal@koreth.finance</a>.
      </p>
    </LegalPage>
  );
}
