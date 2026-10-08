package com.financeflow.app;
import android.content.Context;
import java.io.*;
import java.util.*;
import java.util.zip.*;
import java.nio.charset.StandardCharsets;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.*;
import org.json.*;
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import com.tom_roush.pdfbox.text.TextPosition;

/** Offline extractors. Extracted rows are always reviewed; no financial direction is guessed. */
public final class StatementDocumentReader {
    private static Document xml(byte[] bytes) throws Exception {
        String text=new String(bytes,StandardCharsets.UTF_8);if(text.toUpperCase(Locale.ROOT).contains("<!DOCTYPE")||text.toUpperCase(Locale.ROOT).contains("<!ENTITY"))throw new IOException("External XML entities are not allowed");
        DocumentBuilderFactory f=DocumentBuilderFactory.newInstance();f.setNamespaceAware(false);return f.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
    }
    private static String text(Element e,String name){NodeList nodes=e.getElementsByTagName(name);return nodes.getLength()==0?"":nodes.item(0).getTextContent();}
    private static int column(String ref){int n=0;for(char c:ref.toCharArray()){if(c<'A'||c>'Z')break;n=n*26+c-'A'+1;}return Math.max(n-1,0);}
    public static JSONObject xlsx(byte[] input) throws Exception {
        Map<String,byte[]> files=new HashMap<>();int expanded=0,count=0;
        try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(input))){ZipEntry e;byte[] buf=new byte[8192];while((e=zip.getNextEntry())!=null){if(++count>2000)throw new IOException("Workbook has too many archive entries");ByteArrayOutputStream b=new ByteArrayOutputStream();int n;while((n=zip.read(buf))!=-1){expanded+=n;if(expanded>32*1024*1024)throw new IOException("Workbook expands beyond 32 MB");b.write(buf,0,n);}files.put(e.getName(),b.toByteArray());}}
        if(!files.containsKey("xl/workbook.xml"))throw new IOException("Select an XLSX workbook; older XLS files are not supported");
        List<String> strings=new ArrayList<>();if(files.containsKey("xl/sharedStrings.xml")){NodeList items=xml(files.get("xl/sharedStrings.xml")).getElementsByTagName("si");for(int i=0;i<items.getLength();i++)strings.add(items.item(i).getTextContent());}
        Set<Integer> dates=new HashSet<>();if(files.containsKey("xl/styles.xml")){Document styles=xml(files.get("xl/styles.xml"));Map<Integer,String> formats=new HashMap<>();NodeList fs=styles.getElementsByTagName("numFmt");for(int i=0;i<fs.getLength();i++){Element f=(Element)fs.item(i);formats.put(Integer.parseInt(f.getAttribute("numFmtId")),f.getAttribute("formatCode"));}NodeList groups=styles.getElementsByTagName("cellXfs");if(groups.getLength()>0){NodeList xfs=((Element)groups.item(0)).getElementsByTagName("xf");for(int i=0;i<xfs.getLength();i++){int id=Integer.parseInt(((Element)xfs.item(i)).getAttribute("numFmtId"));String format=formats.getOrDefault(id,"").replaceAll("\"[^\"]*\"","").toLowerCase(Locale.ROOT);if((id>=14&&id<=17)||id==22||format.contains("yy")||format.contains("dd"))dates.add(i);}}}
        Document book=xml(files.get("xl/workbook.xml"));boolean date1904=false;NodeList props=book.getElementsByTagName("workbookPr");if(props.getLength()>0){String val=((Element)props.item(0)).getAttribute("date1904");date1904=val.equals("1")||val.equals("true");}
        Map<String,String> targets=new HashMap<>();NodeList rels=xml(files.get("xl/_rels/workbook.xml.rels")).getElementsByTagName("Relationship");for(int i=0;i<rels.getLength();i++){Element r=(Element)rels.item(i);String target=r.getAttribute("Target");if(r.getAttribute("TargetMode").equals("External")||target.contains(".."))continue;targets.put(r.getAttribute("Id"),target.startsWith("/")?target.substring(1):"xl/"+target);}
        JSONArray sheets=new JSONArray();NodeList metadata=book.getElementsByTagName("sheet");for(int i=0;i<metadata.getLength();i++){Element meta=(Element)metadata.item(i);byte[] content=files.get(targets.get(meta.getAttribute("r:id")));if(content==null)continue;JSONArray rows=new JSONArray();NodeList rr=xml(content).getElementsByTagName("row");if(rr.getLength()>10000)throw new IOException("Split workbooks into 10,000 rows per sheet");int maxWidth=0;
            for(int r=0;r<rr.getLength();r++){NodeList cells=((Element)rr.item(r)).getElementsByTagName("c");JSONArray row=new JSONArray();for(int j=0;j<cells.getLength();j++){Element cell=(Element)cells.item(j);int col=column(cell.getAttribute("r"));if(col>255)throw new IOException("Statement has more than 256 columns");while(row.length()<=col)row.put("");String value=text(cell,"v"),type=cell.getAttribute("t");if(type.equals("s")){int index=Integer.parseInt(value);value=strings.get(index);}else if(type.equals("inlineStr"))value=text(cell,"is");else if(type.equals("e"))value="Invalid Excel cell";
                String style=cell.getAttribute("s");if(!value.isEmpty()&&!style.isEmpty()&&dates.contains(Integer.parseInt(style))){double serial=Double.parseDouble(value);if(serial<1||serial>100000)throw new IOException("Invalid Excel date");java.util.Calendar cal=new GregorianCalendar(TimeZone.getTimeZone("UTC"));cal.clear();cal.set(date1904?1904:1899,date1904?0:11,date1904?1:30);cal.add(Calendar.DATE,(int)Math.floor(serial));java.text.SimpleDateFormat fmt=new java.text.SimpleDateFormat("yyyy-MM-dd",Locale.ROOT);fmt.setTimeZone(TimeZone.getTimeZone("UTC"));value=fmt.format(cal.getTime());}
                row.put(col,value);}maxWidth=Math.max(maxWidth,row.length());rows.put(row);}
            // Sparse workbook cells still belong to the same mapped columns.
            for(int r=0;r<rows.length();r++){JSONArray row=rows.getJSONArray(r);while(row.length()<maxWidth)row.put("");}
            sheets.put(new JSONObject().put("name",meta.getAttribute("name")).put("rows",rows));}
        if(sheets.length()==0)throw new IOException("No readable worksheets found");return new JSONObject().put("sheets",sheets);
    }
    public static JSONObject pdf(Context context,byte[] input,String password) throws Exception {
        PDFBoxResourceLoader.init(context);try(PDDocument doc=PDDocument.load(input,password)){if(doc.getNumberOfPages()>100)throw new IOException("Split PDF statements into at most 100 pages");if(!doc.getCurrentAccessPermission().canExtractContent())throw new IOException("PDF does not permit text extraction");
            final JSONArray rows=new JSONArray();PDFTextStripper strip=new PDFTextStripper(){
                @Override protected void writeString(String text,List<TextPosition> positions) throws IOException {
                    JSONArray cells=new JSONArray();StringBuilder value=new StringBuilder();float end=-1;for(TextPosition p:positions){float gap=end<0?0:p.getXDirAdj()-end;if(gap>Math.max(8,p.getWidthOfSpace()*2.5f)&&value.length()>0){cells.put(value.toString().trim());value.setLength(0);}if(gap>p.getWidthOfSpace()*0.6f&&gap<=Math.max(8,p.getWidthOfSpace()*2.5f)&&value.length()>0&&value.charAt(value.length()-1)!=' ')value.append(' ');value.append(p.getUnicode());end=p.getXDirAdj()+p.getWidthDirAdj();}if(value.length()>0)cells.put(value.toString().trim());if(cells.length()>0)rows.put(cells);if(rows.length()>10000)throw new IOException("PDF has too many text rows");
                }};strip.setSortByPosition(true);strip.getText(doc);if(rows.length()<2)throw new IOException("No text table found. Scanned PDFs need OCR; export CSV or Excel from your bank.");return new JSONObject().put("sheets",new JSONArray().put(new JSONObject().put("name","PDF text (verify column alignment)").put("rows",rows))).put("warning","PDF layouts vary. Check every mapped column and amount. Misaligned rows remain excluded.");}
    }
    private StatementDocumentReader(){}
}
