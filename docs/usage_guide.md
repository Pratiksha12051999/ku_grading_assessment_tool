## Usage Guide

1. Download Required Sample Files and upload them in kudocuments S3 bucket. We are generating rubric for Essay Set 8 (Narrative Essay).
   2. Upload the following files to the S3 bucket created by CDK stack. You can find the bucket name in the CloudFormation outputs in AWS Console.

      You can use the following links to download the files:
      1. original_rubric_guidelines_s3_file : https://drive.google.com/file/d/1E3-tJzc26ZZdYGb6J0ie4qDWUDDivY3U/view?usp=drive_link
         
         Note : This document must have rubric generation guidelines for the essay_type you are generating the rubric for. Check sample file for reference.
   
      2. sample_essays_csv_s3_file : https://drive.google.com/file/d/1hyPNc6EKhJfiQ6jV11hwq6a2nsik3jBT/view?usp=drive_link
      
         Note : This file contains sample essay responses and essay scores for the essay type you are trying to grade. A bigger sample of examples would mean better context for the LLM to generate the rubric based on these sample essays. Check sample file for reference.

2.Use this JSON body to call the Generate Rubric endpoint: Replace the S3 URLs with the ones you uploaded in step 1.
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
     "original_rubric_guidelines_s3_url": "s3://kuessaygradingstack-dev-kudocumentsbucketfaec8400-nsot9pq5xre3/EssaySet8_ReadMeFirst.pdf",
     "sample_essays_csv_s3_url": "s3://kuessaygradingstack-dev-kudocumentsbucketfaec8400-nsot9pq5xre3/dataset_8.csv"
   }
   ```
3. Hit the Generate Rubric Endpoint from postman and ensure you get a 200 response.

4. Now Upload this sample json file to the frontend application to grade essays. 

   Sample JSON file : https://drive.google.com/file/d/1sLRZEm_6zgWSqbZh108xse4de9E8p0VR/view?usp=drive_link
