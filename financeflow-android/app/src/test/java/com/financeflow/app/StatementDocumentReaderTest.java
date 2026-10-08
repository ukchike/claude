package com.financeflow.app;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.util.zip.*;
import org.json.*;
public class StatementDocumentReaderTest {
    private byte[] workbook(String rows,String styles) throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(ZipOutputStream z=new ZipOutputStream(bytes)){
            put(z,"xl/workbook.xml","<workbook><sheets><sheet name=\"Transactions\" r:id=\"s1\"/></sheets></workbook>");
            put(z,"xl/_rels/workbook.xml.rels","<Relationships><Relationship Id=\"s1\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
            put(z,"xl/worksheets/sheet1.xml","<worksheet><sheetData>"+rows+"</sheetData></worksheet>");if(styles!=null)put(z,"xl/styles.xml",styles);
        }return bytes.toByteArray();
    }
    private void put(ZipOutputStream z,String name,String data) throws Exception {z.putNextEntry(new ZipEntry(name));z.write(data.getBytes("UTF-8"));z.closeEntry();}
    @Test public void sparseColumnsAndCachedFormulas() throws Exception {
        String rows="<row><c r=\"A1\" t=\"inlineStr\"><is><t>Date</t></is></c><c r=\"B1\" t=\"inlineStr\"><is><t>Description</t></is></c><c r=\"D1\" t=\"inlineStr\"><is><t>Credit</t></is></c></row><row><c r=\"A2\" t=\"inlineStr\"><is><t>2026-10-08</t></is></c><c r=\"B2\" t=\"inlineStr\"><is><t>Consulting</t></is></c><c r=\"D2\"><f>100*2</f><v>200</v></c></row>";
        JSONArray rr=StatementDocumentReader.xlsx(workbook(rows,null)).getJSONArray("sheets").getJSONObject(0).getJSONArray("rows");assertEquals(4,rr.getJSONArray(1).length());assertEquals("",rr.getJSONArray(1).getString(2));assertEquals("200",rr.getJSONArray(1).getString(3));
    }
    @Test public void styledSerialDateAndNumericAmount() throws Exception {
        JSONObject out=StatementDocumentReader.xlsx(workbook("<row><c r=\"A1\" s=\"0\"><v>46200</v></c><c r=\"B1\"><v>15000.50</v></c></row>","<styleSheet><cellXfs><xf numFmtId=\"14\"/></cellXfs></styleSheet>"));
        JSONArray r=out.getJSONArray("sheets").getJSONObject(0).getJSONArray("rows").getJSONArray(0);assertTrue(r.getString(0).matches("2026-[0-9]{2}-[0-9]{2}"));assertEquals("15000.50",r.getString(1));
    }
    @Test(expected=Exception.class) public void externalXmlEntitiesAreRejected() throws Exception {StatementDocumentReader.xlsx(workbook("<!DOCTYPE row [<!ENTITY x SYSTEM 'file:///private'>]><row/>",null));}
    @Test(expected=Exception.class) public void invalidWorkbookRejected() throws Exception {StatementDocumentReader.xlsx(new byte[]{1,2,3});}
}
