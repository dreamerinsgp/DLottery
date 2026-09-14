import { useState } from "react";

const questions = [
  {
    en: [
      "Can I check the results without a wallet?",
      "Yes. View the current round and open Past draws to inspect completed rounds, ticket allocations and results. You only need a connected wallet when submitting an action.",
    ],
    zh: [
      "不连接钱包也能查看结果吗？",
      "可以。查看当前轮次，或打开 Past draws（历史开奖）查看已结算轮次、票号分配和结果。只有提交操作时才需要连接钱包。",
    ],
  },
  {
    en: [
      "How do I join a draw?",
      "Connect your wallet on Ethereum Sepolia and make sure it has Sepolia ETH for gas. Click Get 1,000 test USD8 and confirm. In an open round, click Buy one ticket, approve 10 USD8 if requested, then confirm the separate purchase. Wait for “Ticket … is yours” and check your wallet in the ticket allocation.",
    ],
    zh: [
      "如何参加抽奖？",
      "在 Ethereum Sepolia 网络连接钱包，并准备 Sepolia ETH 支付手续费。点击 Get 1,000 test USD8 并确认领取。在开放的轮次中点击 Buy one ticket，按提示授权 10 USD8，再单独确认购票交易。等待“Ticket … is yours”提示，并在票号分配中确认钱包地址。",
    ],
  },
  {
    en: [
      "What is the difference between Sepolia ETH and test USD8?",
      "Sepolia ETH pays blockchain transaction fees. Test USD8 pays the 10 USD8 ticket price. The in-app faucet supplies test USD8 only; obtain Sepolia ETH separately from a Sepolia faucet or a funded test wallet. This deployment uses test assets.",
    ],
    zh: [
      "Sepolia ETH 和测试 USD8 有什么区别？",
      "Sepolia ETH 用于支付链上交易手续费，测试 USD8 用于支付每张票的 10 USD8 票款。应用内水龙头只提供测试 USD8；Sepolia ETH 需要通过 Sepolia 水龙头或有余额的测试钱包另行获取。此部署使用测试资产。",
    ],
  },
  {
    en: [
      "Why did approval succeed but I still have no ticket?",
      "Approval only lets the lottery spend 10 USD8. You must also confirm the following ticket purchase in your wallet. These are two different transactions. Check whether the purchase succeeded before trying again.",
    ],
    zh: [
      "为什么授权成功后仍然没有票？",
      "授权只允许抽奖合约使用 10 USD8。还需要在钱包中确认随后的购票交易，两者是不同的交易。再次尝试之前，请先检查购票交易是否已成功。",
    ],
  },
  {
    en: [
      "Why is the buy button unavailable? Can I choose my number?",
      "Connect a wallet and check that the current round is open, its deadline has not passed, fewer than five tickets are sold, and your wallet has not already joined. Each wallet gets one ticket per round. Numbers 1–5 are assigned in purchase order; you cannot choose a number. Use Switch wallet to select another connected account.",
    ],
    zh: [
      "为什么不能购票？可以选择号码吗？",
      "请连接钱包，并确认当前轮次开放、尚未到期、售票数不足五张，且当前钱包尚未参与。每个钱包每轮限购一张，票号 1–5 按购票顺序分配，不能自选号码。可以通过 Switch wallet 选择其他已连接的账户。",
    ],
  },
  {
    en: [
      "Can an examiner try the demo if there are no other users?",
      "Yes. An operator can prepare four separate demo wallets with Sepolia ETH and test USD8, buy one ticket from each, and leave the fifth place for the examiner. Five demo wallets can also complete an observer-only demonstration. These require real testnet transactions; the website does not automatically add players. Check the live participant count and deadline, and identify operator-controlled wallets as demo participants in the assessment materials.",
    ],
    zh: [
      "没有其他用户，评审还能体验吗？",
      "可以。演示组织者可以准备四个独立的演示钱包，为每个钱包提供 Sepolia ETH 和测试 USD8，各购买一张票，将第五个名额留给评审。也可以用五个演示钱包完成供评审观看的演示。这些操作需要真实的测试网交易，网站不会自动添加玩家。请以实时参与人数和截止时间为准，并在评审材料中明确标注由组织者控制的演示钱包。",
    ],
  },
  {
    en: [
      "When can I draw? Does it happen automatically?",
      "At five participants, anyone with a connected wallet and gas can click Perform lottery draw. Otherwise, wait until the 24-hour deadline. Two participants meet the minimum but do not enable an early draw. Settlement requires someone to submit a transaction; it does not run automatically.",
    ],
    zh: [
      "什么时候可以开奖？会自动开奖吗？",
      "达到五位参与者后，任何已连接且有手续费的钱包都可以点击 Perform lottery draw。否则需要等待 24 小时截止时间。两人满足最低参与人数，但不能提前开奖。结算需要有人提交交易，不会自动执行。",
    ],
  },
  {
    en: [
      "Why is the round still drawing? Can anyone choose the result?",
      "After the draw request confirms, Chainlink VRF supplies randomness in a separate transaction. Wait for the result; it may take a few minutes. No participant or operator can choose a winning number. If the wait is prolonged, share the round ID and request hash with the demo operator. Retry delivery of a ready result only delivers randomness that has already arrived; it cannot create a new result or fix a missing VRF response.",
    ],
    zh: [
      "为什么一直显示开奖中？可以指定结果吗？",
      "开奖请求确认后，Chainlink VRF 会通过另一笔交易提供随机数。请等待结果，可能需要几分钟。参与者和演示组织者都不能指定中奖号码。如果长时间未完成，请将轮次编号和请求交易哈希交给演示组织者。Retry delivery of a ready result 只能重新传递已到达的随机数，不能生成新结果，也不能解决 VRF 尚未响应的问题。",
    ],
  },
  {
    en: [
      "Why was there no winner? Do I get a refund?",
      "The lucky number is drawn from 1–10, while only purchased ticket numbers are assigned. If the lucky number is unassigned, nobody wins and the whole pool rolls into the next round. This outcome does not refund tickets.",
    ],
    zh: [
      "为什么没有中奖者？能退款吗？",
      "幸运号码从 1–10 中抽取，但只有已购买的票号才有持有人。如果抽中未分配的号码，则无人中奖，整个奖池滚入下一轮。这种结果不退还票款。",
    ],
  },
  {
    en: [
      "How do prizes, refunds and the next round work?",
      "A winner connects the winning wallet and clicks Claim your prize. The DAO receives 5% of net profit after excluding the winner’s 10 USD8 ticket principal. If settlement after the deadline finds fewer than two participants, the round is cancelled and each buyer can claim a 10 USD8 refund; inherited rollover stays for future rounds. After settlement, anyone can start the next draw. Eligible old claims remain accessible through Past draws.",
    ],
    zh: [
      "如何领奖、退款和开始下一轮？",
      "中奖者连接中奖钱包并点击 Claim your prize。DAO 收取净利润的 5%，计算时排除中奖者的 10 USD8 票款本金。如果到期后结算时不足两位参与者，轮次取消，每位购票者可领取 10 USD8 退款；继承的滚存资金留给后续轮次。结算后任何人都可以开始下一轮。旧轮次符合条件的领奖和退款仍可通过 Past draws 操作。",
    ],
  },
  {
    en: [
      "How do I check a transaction or a delayed history update?",
      "On Sepolia, click View on Etherscan beside the latest transaction hash, or paste a hash into Check transactions below. My wallet activity helps find earlier transactions. Approval, purchase, draw request and VRF fulfillment each have separate hashes. If a transaction succeeded but history is behind, allow three block confirmations and indexing, then refresh; do not repeat a completed purchase.",
    ],
    zh: [
      "如何查看交易或处理历史记录更新延迟？",
      "在 Sepolia 上，点击最近交易哈希旁的 View on Etherscan，或在下方 Check transactions 中粘贴哈希。My wallet activity 可用于查找较早的交易。授权、购票、开奖请求和 VRF 回调各自拥有不同的哈希。如果交易已成功但历史记录尚未更新，请等待三个区块确认及索引完成，再刷新；不要重复已完成的购票。",
    ],
  },
  {
    en: [
      "What if my wallet or the app shows an error?",
      "Select Ethereum Sepolia and the intended account, check your Sepolia ETH and USD8 balances, and review any pending wallet prompts. Declining a wallet request does not complete that action. For a temporary connection error, retry or refresh and check the transaction status before resubmitting. For help from the demo operator, share the round ID, public wallet address, transaction hash and error text. Never share a private key or recovery phrase.",
    ],
    zh: [
      "钱包或网页报错怎么办？",
      "选择 Ethereum Sepolia 和正确的账户，检查 Sepolia ETH 与 USD8 余额，并查看钱包中待处理的提示。拒绝钱包请求不会完成该操作。遇到临时连接错误可以重试或刷新，再次提交前先检查交易状态。向演示组织者求助时，可提供轮次编号、公开钱包地址、交易哈希和错误信息。不要提供私钥或助记词。",
    ],
  },
];

export function Help() {
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const chinese = language === "zh";
  return (
    <section
      id="help"
      className="panel help"
      aria-labelledby="help-heading"
      lang={chinese ? "zh-CN" : "en"}
    >
      <div className="panel-top help-heading">
        <div>
          <span className="eyebrow">
            {chinese ? "SEPOLIA 演示指南" : "SEPOLIA DEMO GUIDE"}
          </span>
          <h2 id="help-heading">
            {chinese ? "帮助与常见问题" : "Help & common questions"}
          </h2>
        </div>
        <div
          className="help-languages"
          role="group"
          aria-label="Help language / 帮助语言"
        >
          <button
            type="button"
            lang="en"
            aria-pressed={!chinese}
            onClick={() => setLanguage("en")}
          >
            English
          </button>
          <button
            type="button"
            lang="zh-CN"
            aria-pressed={chinese}
            onClick={() => setLanguage("zh")}
          >
            中文
          </button>
        </div>
      </div>
      <p className="help-intro">
        {chinese
          ? "点击问题展开答案，无需连接钱包。语言切换仅适用于本帮助区域。"
          : "Select a question to read its answer. No wallet needed. The language switch applies to this help section."}
      </p>
      <div className="help-questions">
        {questions.map((question) => (
          <details key={question.en[0]}>
            <summary>{question[language][0]}</summary>
            <p>{question[language][1]}</p>
          </details>
        ))}
      </div>
      <div className="help-links">
        <a href="#history">
          {chinese ? "查看历史开奖 →" : "View past draws →"}
        </a>
        <a
          href={`https://github.com/dreamerinsgp/DLottery/blob/main/docs/examiner-guide${chinese ? ".zh-CN" : ""}.md`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {chinese ? "完整评审指南 ↗" : "Full examiner guide ↗"}
        </a>
      </div>
    </section>
  );
}
