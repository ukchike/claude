package com.financeflow.app;

import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure parser: no Android dependencies. Detections are suggestions, never posted payments. */
public final class BankAlertParser {
    private static final Pattern MONEY = Pattern.compile(
        "(?:\\bNGN|₦)\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)(?![0-9.,])", Pattern.CASE_INSENSITIVE);
    private static final Pattern VALID = Pattern.compile("(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]{1,2})?");
    private static final Pattern CREDIT = Pattern.compile("\\b(?:credited|credit alert|credit|inflow|deposit received|received from)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEBIT = Pattern.compile("\\b(?:debited|debit alert|debit|purchase|withdrawn|withdrawal|sent to|outflow|paid to)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CONTEXT = Pattern.compile("\\b(?:credited|debited|credit|debit|transaction|transfer|withdrawal|withdrawn|deposit|acct|account|purchase|payment|received|sent|paid|pos|atm|inflow|outflow)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern BALANCE = Pattern.compile("\\b(?:balance|bal|available|ledger balance)\\b\\s*[:=]?\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern REFERENCE = Pattern.compile("\\b(?:reference|ref|session id|transaction id)\\s*[:#=-]?\\s*([A-Za-z0-9_-]{4,80})", Pattern.CASE_INSENSITIVE);

    public static final class Result {
        public final double amount;
        public final String type, reference;
        public final boolean amountUncertain;
        Result(double amount, String type, String reference, boolean uncertain) {
            this.amount=amount; this.type=type; this.reference=reference; this.amountUncertain=uncertain;
        }
    }

    public static Result parse(String text) {
        if(text==null || !CONTEXT.matcher(text).find())return null;
        Matcher matcher=MONEY.matcher(text);
        ArrayList<Double> values=new ArrayList<>();
        while(matcher.find()) {
            String raw=matcher.group(1);
            if(!VALID.matcher(raw).matches())continue;
            String before=text.substring(Math.max(0,matcher.start()-50),matcher.start());
            if(BALANCE.matcher(before).find())continue;
            double amount;
            try {amount=Double.parseDouble(raw.replace(",",""));}catch(NumberFormatException e){continue;}
            if((Double.isNaN(amount)||Double.isInfinite(amount))||amount<=0)continue;
            if(!values.contains(amount))values.add(amount);
        }
        if(values.isEmpty())return null;
        boolean credit=CREDIT.matcher(text).find(),debit=DEBIT.matcher(text).find();
        String type=credit==debit?"unknown":credit?"income":"expense";
        Matcher ref=REFERENCE.matcher(text);
        return new Result(values.get(0),type,ref.find()?ref.group(1):"",values.size()>1);
    }
    private BankAlertParser() {}
}
