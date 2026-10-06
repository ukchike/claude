package com.financeflow.app;
public final class BankAlertParserTest {
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    public static void main(String[] args){
        BankAlertParser.Result r=BankAlertParser.parse("NGN15000.00 debited from account. Balance: NGN200000.00");
        check(r!=null&&r.amount==15000&&r.type.equals("expense"),"uncommaed amount and balance exclusion");
        r=BankAlertParser.parse("Balance: NGN200000.00. Amount: NGN15,000.00 credited. Ref: ABCD1234");
        check(r!=null&&r.amount==15000&&r.type.equals("income")&&r.reference.equals("ABCD1234"),"balance-first alert/reference");
        r=BankAlertParser.parse("Transfer of ₦1,500.50 on account");
        check(r!=null&&r.type.equals("unknown"),"ambiguous direction never defaults to expense");
        r=BankAlertParser.parse("NGN15,000 debited and NGN15,000 credited");
        check(r!=null&&r.type.equals("unknown"),"conflicting direction");
        r=BankAlertParser.parse("NGN15000 debited; fee NGN50 paid to bank");
        check(r!=null&&r.amountUncertain,"multiple amounts flagged");
        check(BankAlertParser.parse("Your balance: NGN20,000 account")==null,"balance-only notification ignored");
        check(BankAlertParser.parse("New device costs NGN15000")==null,"nonbank wording ignored");
        check(BankAlertParser.parse("NGN15,00 debited from account")==null,"malformed grouping rejected");
        check(BankAlertParser.parse("NGN15000.001 debited from account")==null,"excess decimal precision rejected");
        check(BankAlertParser.parse("N5G network on account")==null,"bare N not treated as currency");
        System.out.println("Bank-alert parser: 10 checks passed.");
    }
}
