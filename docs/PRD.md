# DLottery Product Requirements Document

[English](PRD.md) | [简体中文](PRD.zh-CN.md) | [Documentation](README.md)

This is the supplied assessment requirement. The Chinese version is a reference translation. Implementation choices that resolve ambiguities are documented in [architecture.md](architecture.md).

**Product:** DLottery (Decentralized Lottery)\
**Document Type:** Product Requirements Document (PRD)\
**Scope:** MVP

---

## 1. Overall Product Description and Business Flow

### 1.1 Product Description

DLottery is a decentralized lottery application deployed on an EVM-compatible blockchain.

The product consists of:

- **Smart Contract:** Manages lottery rounds, ticket purchases, random draw settlement, prizes, refunds, rollover funds, and DAO fees.
- **Frontend:** Provides wallet connection, ticket purchase, draw interaction, results, refunds, and draw history.
- **Backend:** Acts as a blockchain event indexer and history/query service.
- **USD8:** ERC20 token used to purchase lottery tickets.

### 1.2 Core Business Rules

| Item                      | Requirement                                       |
| ------------------------- | ------------------------------------------------- |
| Payment Token             | USD8                                              |
| Ticket Price              | 10 USD8                                           |
| Maximum Participants      | 5 per draw                                        |
| Ticket Numbers            | 1–10                                              |
| Tickets per Wallet        | 1 per draw                                        |
| Draw Duration             | 24 hours                                          |
| Minimum Participants      | Configurable, e.g. 2                              |
| Draw Trigger              | 5 participants or 24-hour timeout                 |
| Insufficient Participants | Draw cancelled and refunds enabled                |
| Winner                    | Participant whose ticket matches the lucky number |
| No Winner                 | Prize pool rolls over to the next draw            |
| DAO Fee                   | 5% of winner net profit                           |

### 1.3 Overall Business Flow

```text
Start New Draw
      |
      v
     ACTIVE
      |
      v
Users Buy Tickets
      |
      +-----------------------------+
      |                             |
  5 Participants              24 Hours Elapsed
      |                             |
      +-------------+---------------+
                    |
                    v
              Check Minimum
              Participants
                    |
          +---------+---------+
          |                   |
       Enough              Not Enough
          |                   |
          v                   v
   READY TO DRAW          CANCELLED
          |                   |
          v                   v
    Perform Draw         Claim Refund
          |
     +----+----+
     |         |
  Winner    No Winner
     |         |
     v         v
Claim Prize  Rollover Pool
     |         |
     v         v
 COMPLETED  Next Draw
```

---

## 2. Smart Contract Feature List

The smart contract is the authoritative source of lottery and financial state.

### 2.1 Draw Management

- Initialize the lottery configuration.
- Create a unique Draw ID.
- Start a new draw and record its start time.
- Ensure the previous draw is finalized before starting a new one.
- Carry forward rollover funds to the next draw.
- Manage draw states.

### 2.2 Ticket Management

- Accept USD8 ticket payments.
- Validate draw status and 24-hour deadline.
- Enforce the maximum participant limit.
- Allow only one ticket per wallet per draw.
- Assign a unique ticket number from 1–10.
- Prevent duplicate ticket numbers.
- Emit ticket purchase events.

### 2.3 Lottery Settlement

- Allow the draw only after the round is eligible for settlement.
- Verify the minimum participant requirement.
- Generate the lucky number.
- Determine whether a participant matches the lucky number.
- Record the winner when a match exists.
- Mark the round as `NO_WINNER` when there is no match.
- Roll over the prize pool when there is no winner.

### 2.4 Prize and Refund Management

- Allow only the winner to claim the prize.
- Calculate the winner's net profit.
- Transfer the DAO fee.
- Transfer the remaining prize to the winner.
- Enable refunds only for cancelled rounds.
- Allow each participant to claim their ticket principal once.

### 2.5 Required Contract Events

- `DrawStarted`
- `TicketBought`
- `LotteryDrawn`
- `DrawCancelled`
- `PrizeClaimed`
- `RefundClaimed`

---

## 3. Backend Feature List

The backend is a passive blockchain indexer and query service. It does not determine lottery results or control funds.

### 3.1 Backend Deployment Architecture

The backend is deployed as a **containerized service** and implemented using **one** of the following:

- **Golang**
- **Rust**
- **Node.js**

The implementation language is an engineering decision. Regardless of the selected language, the backend must provide the same functional capabilities and APIs.

Deployment requirements:

- Containerized deployment
- Blockchain RPC connectivity
- MySQL or PostgreSQL connectivity
- REST API service
- Blockchain event listener
- Production-ready logging and error handling

### 3.2 Blockchain Event Listener

Continuously monitor lottery contract events:

- Draw started
- Ticket purchased
- Lottery drawn
- Draw cancelled
- Prize claimed
- Refund claimed

The listener must support:

- RPC reconnection
- Event processing
- Block confirmation handling
- Reorganization protection
- Retry and error handling

### 3.3 Database Synchronization

Store and maintain lottery history, including:

- Draw ID
- Draw status
- Start/end time
- Ticket price
- Participant count
- Lucky number
- Winner address
- Total prize pool
- DAO fee
- Winner prize

Historical records should be updated idempotently to avoid duplicate data.

### 3.4 Backend APIs

#### Current Draw

`GET /api/v1/draws/current`

Provides:

- Current draw information
- Draw status
- Remaining time
- Participant information
- Ticket allocation
- Prize pool

#### Draw History

`GET /api/v1/draws/history`

Provides paginated historical draw records, including:

- Draw ID
- Status
- Start/end time
- Lucky number
- Winner
- Total pool
- DAO fee
- Winner prize

---

## 4. Frontend Feature List

### 4.1 Wallet

- Connect Web3 wallet.
- Display connected wallet address.
- Display USD8 balance.
- Detect the user's participation status.
- Enable/disable actions according to draw status.

### 4.2 Active Draw Dashboard

Display:

- Current Draw ID
- Draw status
- Ticket price
- Participant count
- Remaining time
- Total prize pool
- Ticket number allocation

The ticket allocation table displays numbers **1–10** and the corresponding wallet addresses.

### 4.3 Ticket Purchase

The frontend must:

1. Check USD8 balance.
2. Check USD8 allowance.
3. Request approval when necessary.
4. Submit the ticket purchase transaction.
5. Display transaction status.
6. Display the assigned ticket number.
7. Prevent another purchase from the same wallet during the round.

### 4.4 Lottery Draw

When the draw is eligible:

- Display the **Perform Lottery Draw** action.
- Show a short spinning/loading animation.
- Wait for blockchain confirmation.
- Display the final result.

### 4.5 Winner Result

Display:

- Winner wallet
- Lucky number
- Total prize pool
- DAO fee
- Winner claimable amount
- Prize claim action

### 4.6 No-Winner Result

Display:

- Lucky number
- No-winner result
- Rollover amount
- Next draw information when available

### 4.7 Refund

For cancelled draws:

- Display the cancellation status.
- Display **Claim Refund** for eligible participants.
- Show refund transaction status.
- Disable the refund action after successful claim.

### 4.8 Draw History

Display historical lottery results, including:

- Draw ID
- Status
- Time
- Lucky number
- Winner
- Total pool
- DAO fee
- Winner prize

---

## 5. Core Flowcharts and Formulas

## 5.1 Ticket Purchase Flow

```text
Connect Wallet
      |
      v
View Active Draw
      |
      v
Check USD8 Balance
      |
      v
Check USD8 Allowance
      |
      +---- Allowance Insufficient ----> Approve USD8
      |                                      |
      +--------------------------------------+
                     |
                     v
                Buy Ticket
                     |
                     v
             Transfer USD8
                     |
                     v
          Assign Unique Ticket
                     |
                     v
             Ticket Purchased
                     |
                     v
             Update Frontend
```

---

## 5.2 Lottery Draw / Settlement Flow

```text
Draw Becomes Eligible
(5 Participants OR 24 Hours)
             |
             v
     Check Minimum Quorum
             |
             v
     Perform Lottery Draw
             |
             v
      Generate Lucky Number
             |
        +----+----+
        |         |
      Match    No Match
        |         |
        v         v
    Winner      No Winner
   Declared     Declared
        |         |
        v         v
  Claim Prize   Rollover Pool
        |         |
        v         v
   Completed    Next Draw
```

---

## 5.3 Refund Flow

```text
24 Hours Elapsed
        |
        v
Participants < Minimum
        |
        v
     Cancelled
        |
        v
Participant Connects Wallet
        |
        v
    Claim Refund
        |
        v
Verify Participant
        |
        v
Return Ticket Principal
        |
        v
Mark Refund as Claimed
```

---

## 5.4 Winner Profit Calculation

### Variables

- **T** = Ticket Price
- **N** = Number of Participants
- **R** = Rollover Amount
- **P_total** = Total Prize Pool

### Total Prize Pool

**P_total = R + (N × T)**

### Winner Net Profit

The winner's original ticket principal is excluded from the DAO fee:

**Net Profit = P_total − T**

---

## 5.5 DAO Fee Calculation

The DAO fee is **5% of the winner's net profit**.

**DAO Fee = max(0, Net Profit × 5%)**

### Winner Claimable Amount

**Winner Claimable = P_total − DAO Fee**

or:

**Winner Claimable = T + (Net Profit × 95%)**

### Example

Given:

- Rollover = 20 USD8
- Participants = 5
- Ticket Price = 10 USD8

Then:

- Total Prize Pool = 20 + (5 × 10) = **70 USD8**
- Winner Net Profit = 70 − 10 = **60 USD8**
- DAO Fee = 60 × 5% = **3 USD8**
- Winner Claimable = 70 − 3 = **67 USD8**

Therefore:

- **Winner receives: 67 USD8**
- **DAO receives: 3 USD8**
