# KU Grading APIs

KU Grading APIs provide endpoints to generate rubrics and grade essays.

## Base URL

`https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev/`

## 1) Rubric Generation API

Trigger rubric generation for a particular essay_type and content_id.

#### POST /generate-rubric

- Purpose: Generate grading rubric
- Note: Replace the S3 URLs with actual S3 bucket document URLs.
- Request body:

   ```json
   {
     "input_type": "direct",
     "content_id": "1",
     "essay_type": "Narrative",
     "grade_level": "10",
     "source_text_title": "",
     "author": "",
     "essay_prompt": "We all understand the benefits of laughter. For example, someone once said, “Laughter is the shortest distance between two people.” Many other people believe that laughter is an important part of any relationship. Tell a true story in which laughter was one element or part.",
     "score_range": "1-6",
     "source_text_content": "",
     "original_rubric_guidelines_s3_url": "s3://kuessaygradingstack-dev-kudocumentsbucketxxxxxxxx-xxxxxxxxxxxx/EssaySet8_ReadMeFirst.pdf",
     "sample_essays_csv_s3_url": "s3://kuessaygradingstack-dev-kudocumentsbucketxxxxxxxx-xxxxxxxxxxxx/dataset_8.csv"
   }
   ```

- Response: 200 OK response with rubric generated successfully message.

#### POST /grade-essay

- Purpose: Grade bulk essays
- Request body: [Sample JSON](sample.json)

- Response: JSON with essays graded with detailed scores of each rubric metric.

All APIs return JSON responses with detailed status information, reasons for pass/fail decisions and source documents.