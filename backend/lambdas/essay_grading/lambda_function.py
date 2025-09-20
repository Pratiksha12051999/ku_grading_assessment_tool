import json
import boto3
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.conditions import Attr
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import os

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
bedrock_client = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Configuration
RUBRICS_TABLE = os.environ.get('RUBRICS_TABLE')
S3_BUCKET = os.environ.get('OUTPUT_BUCKET_NAME')
rubrics_table = dynamodb.Table(RUBRICS_TABLE)

# Cache for rubrics to avoid repeated DynamoDB calls
rubric_cache = {}

def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Unified Lambda function to grade student essays (single or bulk) using Bedrock and stored rubrics

    Input formats:

    Single Essay:
    {
        "student_id": "student123",
        "content_id": "Winter_Hibiscus_Grade10_20250812_180450",
        "essay_type": "Source Dependent Responses",
        "essay_response": "Student essay text here..."
    }

    Bulk Essays:
    {
        "essays": [
            {
                "student_id": "student123",
                "content_id": "Winter_Hibiscus_Grade10_20250812_180450",
                "essay_type": "Source Dependent Responses",
                "essay_response": "Student essay text here..."
            },
            {
                "student_id": "student456",
                "content_id": "Persuasive_Essay_Grade11_20250815_120000",
                "essay_type": "Argumentative Writing",
                "essay_response": "Another student essay text here..."
            }
        ],
        "batch_id": "optional_batch_id",
        "s3_output_prefix": "optional/s3/prefix/",
        "store_in_s3": true
    }
    """

    # Handle CORS preflight requests
    if event.get('httpMethod') == 'OPTIONS':
        return create_cors_response({'message': 'CORS preflight'})

    try:
        start_time = time.time()
        logger.info(f"Received grading request: {json.dumps(event, default=str)}")

        # Extract request body for API Gateway integration
        request_data = extract_request_data(event)

        # Determine processing mode and execute
        if 'essays' in request_data:
            # Bulk processing mode
            result = process_bulk_essays(request_data, context)
        else:
            # Single essay processing mode
            result = process_single_essay(request_data)

        processing_time = time.time() - start_time
        result['processing_time_seconds'] = round(processing_time, 2)

        return create_cors_response(result)

    except Exception as e:
        logger.error(f"Error in lambda_handler: {str(e)}")
        return create_cors_response({
            'error': 'Internal server error',
            'message': str(e)
        }, status_code=500)

def extract_request_data(event: Dict[str, Any]) -> Dict[str, Any]:
    """Extract request data from event (handles API Gateway and direct invocation)"""

    if 'body' in event:
        if isinstance(event['body'], str):
            return json.loads(event['body'])
        else:
            return event['body']
    else:
        # Direct Lambda invocation
        return event

def create_cors_response(body: Dict[str, Any], status_code: int = 200) -> Dict[str, Any]:
    """Create standardized CORS response"""

    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'POST,OPTIONS'
        },
        'body': json.dumps(body, default=str)
    }

def process_single_essay(request_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process a single essay and return result directly"""

    logger.info("Processing single essay")

    try:
        # Extract and validate input parameters
        input_data = extract_and_validate_input(request_data)

        # Retrieve rubric from DynamoDB using essay_type and content_id as content_id
        rubric_data = get_cached_rubric(input_data['essay_type'], input_data.get('content_id'))

        # Grade the essay using Bedrock
        grading_result = grade_essay_with_bedrock(input_data, rubric_data)

        # Prepare output response
        essay_result = prepare_grading_response(input_data, rubric_data, grading_result)

        return {
            'processing_mode': 'single',
            'processing_status': 'completed',
            'student_id': input_data['student_id'],
            'essay_type': input_data['essay_type'],
            'content_id_requested': input_data.get('content_id'),
            'result': essay_result
        }

    except Exception as e:
        logger.error(f"Error processing single essay: {str(e)}")
        return {
            'processing_mode': 'single',
            'processing_status': 'failed',
            'error': str(e)
        }

def process_bulk_essays(request_data: Dict[str, Any], context) -> Dict[str, Any]:
    """Process multiple essays in bulk"""

    essays = request_data.get('essays', [])
    batch_id = request_data.get('batch_id', f"batch_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}")
    s3_output_prefix = request_data.get('s3_output_prefix', f"grading_results/{datetime.utcnow().strftime('%Y/%m/%d')}/")
    store_in_s3 = request_data.get('store_in_s3', True)

    logger.info(f"Processing bulk batch: {batch_id} with {len(essays)} essays")

    if not essays:
        raise ValueError("No essays provided in bulk request")

    # Validate all essays first
    validated_essays = []
    validation_errors = []

    for i, essay_data in enumerate(essays):
        try:
            validated_essay = extract_and_validate_input(essay_data)
            validated_essays.append((i, validated_essay))
        except Exception as e:
            validation_errors.append({
                'essay_index': i,
                'error': str(e),
                'student_id': essay_data.get('student_id', 'unknown')
            })

    logger.info(f"Validated {len(validated_essays)} essays, {len(validation_errors)} validation errors")

    # Pre-load rubrics for all unique essay_type and content_id combinations
    unique_rubric_combinations = set()
    for essay_index, essay_data in validated_essays:
        essay_type = essay_data['essay_type']
        content_id = essay_data.get('content_id')
        unique_rubric_combinations.add((essay_type, content_id))

    logger.info(f"Unique rubric combinations in batch: {list(unique_rubric_combinations)}")

    rubric_load_errors = []
    for essay_type, content_id in unique_rubric_combinations:
        try:
            get_cached_rubric(essay_type, content_id)
            cache_key = f"{essay_type}|{content_id if content_id else 'latest'}"
            logger.info(f"Successfully cached rubric for: {cache_key}")
        except Exception as e:
            rubric_load_errors.append({
                'essay_type': essay_type,
                'content_id': content_id,
                'error': str(e)
            })
            logger.error(f"Failed to load rubric for {essay_type}, content_id: {content_id}: {str(e)}")

    # Process essays in parallel with controlled concurrency
    max_concurrent_requests = min(5, len(validated_essays))
    grading_results = []
    grading_errors = []

    logger.info(f"Processing {len(validated_essays)} essays with max {max_concurrent_requests} concurrent requests")

    # Check remaining execution time and adjust concurrency
    remaining_time = context.get_remaining_time_in_millis() if context else 300000
    if remaining_time < 30000:  # Less than 30 seconds remaining
        logger.warning(f"Limited execution time remaining: {remaining_time}ms. Processing sequentially.")
        max_concurrent_requests = 1

    with ThreadPoolExecutor(max_workers=max_concurrent_requests) as executor:
        # Submit grading tasks for essays with valid rubrics
        future_to_essay = {}
        for essay_index, essay_data in validated_essays:
            if (essay_data['essay_type'], essay_data.get('content_id')) not in [(error['essay_type'], error.get('content_id')) for error in rubric_load_errors]:
                future = executor.submit(grade_single_essay_safe, essay_index, essay_data)
                future_to_essay[future] = (essay_index, essay_data)

        # Collect results as they complete
        for future in as_completed(future_to_essay):
            essay_index, essay_data = future_to_essay[future]
            try:
                result = future.result(timeout=120)  # 2 minute timeout per essay
                if result['success']:
                    grading_results.append(result['data'])
                    logger.info(f"Successfully graded essay {essay_index} for student {essay_data['student_id']}")
                else:
                    grading_errors.append({
                        'essay_index': essay_index,
                        'student_id': essay_data['student_id'],
                        'error': result['error']
                    })
                    logger.error(f"Failed to grade essay {essay_index}: {result['error']}")
            except Exception as e:
                grading_errors.append({
                    'essay_index': essay_index,
                    'student_id': essay_data.get('student_id', 'unknown'),
                    'error': f"Processing timeout or error: {str(e)}"
                })
                logger.error(f"Essay {essay_index} processing failed: {str(e)}")

    # Prepare batch response
    unique_essay_types = list(set(essay[1]['essay_type'] for essay in validated_essays))

    batch_response = {
        'processing_mode': 'bulk',
        'batch_id': batch_id,
        'processing_status': 'completed',
        'summary': {
            'total_essays_submitted': len(essays),
            'total_essays_validated': len(validated_essays),
            'total_essays_graded': len(grading_results),
            'total_validation_errors': len(validation_errors),
            'total_rubric_load_errors': len(rubric_load_errors),
            'total_grading_errors': len(grading_errors)
        },
        'unique_essay_types': unique_essay_types,
        'results': grading_results,
        'errors': {
            'validation_errors': validation_errors,
            'rubric_load_errors': rubric_load_errors,
            'grading_errors': grading_errors
        }
    }

    # Store results in S3 if requested
    if store_in_s3 and grading_results:
        try:
            s3_results = store_results_in_s3(batch_id, grading_results, s3_output_prefix, batch_response)
            batch_response['s3_storage'] = s3_results
            logger.info(f"Successfully stored batch results in S3")
        except Exception as e:
            logger.error(f"Failed to store results in S3: {str(e)}")
            batch_response['s3_storage'] = {
                'success': False,
                'error': str(e)
            }
    elif store_in_s3:
        batch_response['s3_storage'] = {
            'success': False,
            'message': 'No results to store'
        }

    logger.info(f"Bulk processing completed for batch {batch_id}")
    return batch_response

def grade_single_essay_safe(essay_index: int, essay_data: Dict[str, str]) -> Dict[str, Any]:
    """Grade a single essay with error handling for parallel processing"""

    try:
        logger.info(f"Starting to grade essay {essay_index} for student {essay_data['student_id']}")

        # Get rubric using essay_type and content_id (should be cached)
        rubric_data = get_cached_rubric(essay_data['essay_type'], essay_data.get('content_id'))

        # Grade the essay
        grading_result = grade_essay_with_bedrock(essay_data, rubric_data)

        # Prepare response
        response = prepare_grading_response(essay_data, rubric_data, grading_result)
        response['essay_index'] = essay_index

        return {
            'success': True,
            'data': response
        }

    except Exception as e:
        logger.error(f"Error grading essay {essay_index}: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'essay_index': essay_index,
            'student_id': essay_data.get('student_id', 'unknown')
        }

def get_cached_rubric(essay_type: str, content_id: Optional[str] = None) -> Dict[str, Any]:
    """Get rubric with caching to avoid repeated DynamoDB calls"""

    # Create cache key that includes both essay_type and content_id
    cache_key = f"{essay_type}|{content_id if content_id else 'latest'}"

    if cache_key in rubric_cache:
        logger.info(f"Using cached rubric for cache key: {cache_key}")
        return rubric_cache[cache_key]

    logger.info(f"Loading rubric from DynamoDB for cache key: {cache_key}")
    rubric_data = get_rubric_for_essay_type(essay_type, content_id)
    rubric_cache[cache_key] = rubric_data

    return rubric_data

def store_results_in_s3(batch_id: str, grading_results: List[Dict[str, Any]], s3_output_prefix: str, batch_response: Dict[str, Any]) -> Dict[str, Any]:
    """Store grading results in S3"""

    try:
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')

        # Store complete batch results (includes results + metadata)
        batch_results_key = f"{s3_output_prefix}batch_results/{timestamp}_{batch_id}_complete.json"
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=batch_results_key,
            Body=json.dumps(batch_response, default=str, indent=2),
            ContentType='application/json'
        )

        # Store just the grading results array for easier processing
        results_only_key = f"{s3_output_prefix}results_only/{timestamp}_{batch_id}_results.json"
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=results_only_key,
            Body=json.dumps(grading_results, default=str, indent=2),
            ContentType='application/json'
        )

        # Store aggregated results by essay type
        aggregated_results = aggregate_results_by_essay_type(grading_results)
        aggregated_results_key = f"{s3_output_prefix}aggregated/{timestamp}_{batch_id}_aggregated.json"
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=aggregated_results_key,
            Body=json.dumps(aggregated_results, default=str, indent=2),
            ContentType='application/json'
        )

        logger.info(f"Successfully stored {len(grading_results)} results in S3")

        return {
            'success': True,
            'total_results_stored': len(grading_results),
            's3_locations': {
                'complete_batch': f"s3://{S3_BUCKET}/{batch_results_key}",
                'results_only': f"s3://{S3_BUCKET}/{results_only_key}",
                'aggregated_results': f"s3://{S3_BUCKET}/{aggregated_results_key}"
            }
        }

    except Exception as e:
        logger.error(f"Error storing results in S3: {str(e)}")
        raise

def aggregate_results_by_essay_type(grading_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate grading results by essay type for analysis"""

    aggregated = {}

    for result in grading_results:
        essay_type = result.get('essay_type', 'unknown')

        if essay_type not in aggregated:
            aggregated[essay_type] = {
                'essay_type': essay_type,
                'total_essays': 0,
                'average_score': 0,
                'score_distribution': {},
                'average_confidence': 0,
                'flagged_essays': 0
            }

        agg = aggregated[essay_type]
        agg['total_essays'] += 1

        # Score aggregation
        essay_score = result.get('essay_score', 0)
        current_avg = agg['average_score']
        agg['average_score'] = (current_avg * (agg['total_essays'] - 1) + essay_score) / agg['total_essays']

        # Score distribution
        score_str = str(essay_score)
        agg['score_distribution'][score_str] = agg['score_distribution'].get(score_str, 0) + 1

        # Confidence aggregation
        ai_confidence = result.get('ai_confidence', 0)
        current_conf_avg = agg['average_confidence']
        agg['average_confidence'] = (current_conf_avg * (agg['total_essays'] - 1) + ai_confidence) / agg['total_essays']

        # Flagged essays
        if result.get('essay_flagged', '').lower() == 'yes':
            agg['flagged_essays'] += 1

    # Round averages
    for essay_type in aggregated:
        aggregated[essay_type]['average_score'] = round(aggregated[essay_type]['average_score'], 2)
        aggregated[essay_type]['average_confidence'] = round(aggregated[essay_type]['average_confidence'], 1)

    return aggregated

def extract_and_validate_input(event: Dict[str, Any]) -> Dict[str, str]:
    """Extract and validate input parameters"""

    required_params = ['student_id', 'content_id', 'essay_type', 'essay_response']

    for param in required_params:
        if param not in event:
            raise ValueError(f"Missing required parameter: {param}")

    # Validate essay_response is not empty
    if not event['essay_response'].strip():
        raise ValueError("essay_response cannot be empty")

    return {
        'student_id': str(event['student_id']),
        'content_id': str(event['content_id']),
        'essay_type': event['essay_type'],
        'essay_response': event['essay_response'].strip()
    }

def get_rubric_for_essay_type(essay_type: str, content_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Retrieve rubric for the given essay type and optionally specific content_id

    Args:
        essay_type (str): The type of essay (e.g., "Source Dependent Responses")
        content_id (Optional[str]): Specific content_id to retrieve. If None, gets the most recent rubric.

    Returns:
        Dict[str, Any]: The rubric data
    """

    try:
        if content_id:
            logger.info(f"Querying rubrics for essay type: {essay_type} and content_id: {content_id}")

            # Query DynamoDB for specific essay_type and content_id
            response = rubrics_table.query(
                KeyConditionExpression=Key('essay_type').eq(essay_type) & Key('content_id').eq(content_id),
                Limit=1
            )

            logger.info("=== RAW DYNAMODB RESPONSE (with content_id filter) ===")
            logger.info(f"DynamoDB response: {json.dumps(response, default=str, indent=2)}")
            logger.info(f"Items count: {len(response.get('Items', []))}")

            if not response['Items']:
                logger.warning(f"No rubric found for essay type: {essay_type} and content_id: {content_id}")
                raise ValueError(f"No rubric found for essay type: {essay_type} (even with fallback)")

        else:
            logger.info(f"Querying rubrics for essay type: {essay_type} (most recent)")

            # Query DynamoDB for rubrics of this essay type (most recent)
            response = rubrics_table.query(
                KeyConditionExpression=Key('essay_type').eq(essay_type),
                ScanIndexForward=False,  # Get newest first
                Limit=1
            )

            if not response['Items']:
                raise ValueError(f"No rubric found for essay type: {essay_type}")

        rubric = response['Items'][0]

        # Validate that this is the correct rubric
        rubric_essay_id = rubric.get('content_id', '')
        if isinstance(rubric_essay_id, dict) and 'S' in rubric_essay_id:
            rubric_essay_id = rubric_essay_id['S']

        if content_id and rubric_essay_id != content_id:
            logger.warning(f"Retrieved rubric essay_id '{rubric_essay_id}' does not match requested content_id '{content_id}'")

        logger.info(f"Successfully retrieved rubric with essay_id: {rubric_essay_id}")
        return rubric

    except Exception as e:
        logger.error(f"Error retrieving rubric: {str(e)}")
        raise ValueError(f"Failed to retrieve rubric for essay type '{essay_type}'{f' and content_id {content_id}' if content_id else ''}: {str(e)}")

def grade_essay_with_bedrock(input_data: Dict[str, str], rubric_data: Dict[str, Any]) -> Dict[str, Any]:
    """Use Bedrock to grade the essay based on the rubric"""

    # Construct grading prompt
    prompt = construct_grading_prompt(input_data, rubric_data)

    logger.info("Calling Bedrock to grade essay")

    try:
        # Use the Conversation API for Amazon Nova models
        conversation = [
            {
                "role": "user",
                "content": [{"text": prompt}]
            }
        ]

        response = bedrock_client.converse(
            modelId='amazon.nova-pro-v1:0',
            messages=conversation,
            inferenceConfig={
                "maxTokens": 3000,
                "temperature": 0.1,
                "topP": 0.9
            }
        )

        # Extract text from Nova Pro response
        grading_text = response['output']['message']['content'][0]['text']

        logger.info(f"Received grading response: {len(grading_text)} characters")

        # Parse the JSON response from Bedrock
        try:
            grading_result = json.loads(grading_text)
            logger.info("Successfully parsed Bedrock grading response as JSON")
            return grading_result
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Bedrock response as JSON: {str(e)}")
            logger.error(f"Bedrock response: {grading_text[:500]}...")
            raise ValueError(f"Bedrock did not return valid JSON: {str(e)}")

    except Exception as e:
        logger.error(f"Error calling Bedrock for grading: {str(e)}")
        raise

def parse_score_range(score_range_raw) -> tuple[int, int]:
    """Parse score range string to extract min and max scores"""

    # Handle DynamoDB format first
    if isinstance(score_range_raw, dict) and 'S' in score_range_raw:
        score_range_str = score_range_raw['S']
    elif isinstance(score_range_raw, str):
        score_range_str = score_range_raw
    else:
        logger.warning(f"Unexpected score_range format: {score_range_raw}, using default 0-3")
        return 0, 3

    # Clean the string
    score_range_str = score_range_str.strip()

    # Try different parsing patterns
    try:
        # Pattern 1: "0-3", "1-4", etc.
        if '-' in score_range_str:
            parts = score_range_str.split('-')
            if len(parts) == 2:
                min_score = int(parts[0].strip())
                max_score = int(parts[1].strip())
                return min_score, max_score

        # Pattern 2: "0 to 3", "1 to 4", etc.
        if ' to ' in score_range_str.lower():
            parts = score_range_str.lower().split(' to ')
            if len(parts) == 2:
                min_score = int(parts[0].strip())
                max_score = int(parts[1].strip())
                return min_score, max_score

        # Pattern 3: Single number (assume 0 to that number)
        if score_range_str.isdigit():
            max_score = int(score_range_str)
            return 0, max_score

        # If no pattern matches, log warning and use default
        logger.warning(f"Could not parse score_range: '{score_range_str}', using default 0-3")
        return 0, 3

    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing score_range '{score_range_str}': {str(e)}, using default 0-3")
        return 0, 3

def process_flagged_content(flagged_content_raw) -> List[str]:
    """Ensure flagged content is in list format"""
    if isinstance(flagged_content_raw, list):
        # Return as-is if already a list
        return flagged_content_raw
    elif isinstance(flagged_content_raw, str):
        if not flagged_content_raw.strip():
            return []
        # If it's a string, try to split it intelligently
        if " | " in flagged_content_raw:
            return [sentence.strip() for sentence in flagged_content_raw.split(" | ") if sentence.strip()]
        else:
            # If it's a single string, return as single-item list
            return [flagged_content_raw.strip()]
    else:
        return []

def construct_grading_prompt(input_data: Dict[str, str], rubric_data: Dict[str, Any]) -> str:
    """Construct the grading prompt for Bedrock with enhanced self-harm detection and proper score averaging"""

    # Extract rubrics section
    rubrics = rubric_data.get('rubrics', {})
    scoring_guidance = rubric_data.get('scoring_guidance', {})

    # Handle essay_question and score_range with DynamoDB format handling
    essay_question = rubric_data.get('essay_question', 'Not specified')
    if isinstance(essay_question, dict) and 'S' in essay_question:
        essay_question = essay_question['S']

    score_range = rubric_data.get('score_range', '0-3')
    if isinstance(score_range, dict) and 'S' in score_range:
        score_range = score_range['S']

    # Extract metrics
    metrics = []
    if rubrics:
        # Try to get a sample score to extract metrics from
        sample_score = None
        for potential_key in ['score_3', 'score_2', 'score_1', 'score_0']:
            if potential_key in rubrics:
                sample_score = rubrics[potential_key]
                break

        if sample_score is None and rubrics:
            sample_score = next(iter(rubrics.values()))

        if sample_score is not None:
            # Handle DynamoDB format
            if isinstance(sample_score, dict) and 'M' in sample_score:
                sample_data = sample_score['M']
                excluded_keys = ['score_label', 'avoid_confusing_with', 'look_for', 'specific_examples']
                metrics = [key for key in sample_data.keys() if key not in excluded_keys]
            elif isinstance(sample_score, dict):
                excluded_keys = ['score_label', 'avoid_confusing_with', 'look_for', 'specific_examples']
                metrics = [key for key in sample_score.keys() if key not in excluded_keys]

    # Parse score range to get min and max for metrics
    def parse_score_range_for_prompt(score_range_str):
        try:
            if '-' in score_range_str:
                parts = score_range_str.split('-')
                if len(parts) == 2:
                    return int(parts[0].strip()), int(parts[1].strip())
            elif ' to ' in score_range_str.lower():
                parts = score_range_str.lower().split(' to ')
                if len(parts) == 2:
                    return int(parts[0].strip()), int(parts[1].strip())
            elif score_range_str.isdigit():
                return 0, int(score_range_str)
        except:
            pass
        return 0, 3  # Default fallback

    min_metric_score, max_metric_score = parse_score_range_for_prompt(score_range)

    # Extract scoring guidance with DynamoDB format handling
    borderline_cases = scoring_guidance.get('borderline_cases', {})
    if isinstance(borderline_cases, dict) and 'M' in borderline_cases:
        borderline_cases = borderline_cases['M']
        between_2_3 = borderline_cases.get('between_2_3', {}).get('S', '') if 'between_2_3' in borderline_cases else ''
        between_1_2 = borderline_cases.get('between_1_2', {}).get('S', '') if 'between_1_2' in borderline_cases else ''
        between_0_1 = borderline_cases.get('between_0_1', {}).get('S', '') if 'between_0_1' in borderline_cases else ''
    else:
        between_2_3 = borderline_cases.get('between_2_3', '')
        between_1_2 = borderline_cases.get('between_1_2', '')
        between_0_1 = borderline_cases.get('between_0_1', '')

    common_pitfalls = scoring_guidance.get('common_pitfalls', '')
    if isinstance(common_pitfalls, dict) and 'S' in common_pitfalls:
        common_pitfalls = common_pitfalls['S']

    # Build detailed rubric description
    rubric_details = ""
    for score_key in ['score_3', 'score_2', 'score_1', 'score_0']:
        if score_key in rubrics:
            score_num = score_key.split('_')[1]
            score_data = rubrics[score_key]

            # Handle DynamoDB format
            if isinstance(score_data, dict) and 'M' in score_data:
                score_data = score_data['M']
                score_label = score_data.get('score_label', {}).get('S', f'Score {score_num}')
                rubric_details += f"\n## SCORE {score_num} - {score_label}\n"

                for metric in metrics:
                    if metric in score_data:
                        metric_value = score_data[metric].get('S', '') if isinstance(score_data[metric], dict) else score_data[metric]
                        rubric_details += f"{metric.replace('_', ' ').title()}: {metric_value}\n"
            else:
                # Handle regular dict format
                score_label = score_data.get('score_label', f'Score {score_num}')
                rubric_details += f"\n## SCORE {score_num} - {score_label}\n"

                for metric in metrics:
                    if metric in score_data:
                        rubric_details += f"{metric.replace('_', ' ').title()}: {score_data[metric]}\n"

            rubric_details += "\n"

    # Build metric scores JSON dynamically using actual score range
    metric_scores_json = "{\n"
    metric_justifications_json = "{\n"

    for i, metric in enumerate(metrics):
        comma = "," if i < len(metrics) - 1 else ""
        metric_scores_json += f'    "{metric}": [{min_metric_score}-{max_metric_score}]{comma}\n'
        metric_justifications_json += f'    "{metric}": "[Brief explanation for this score]"{comma}\n'

    metric_scores_json += "  }"
    metric_justifications_json += "  }"

    prompt = f"""You are an expert essay grader evaluating work by students in grades 5-12. Grade the following student essay based on the provided rubric. You must return a JSON response with detailed scoring and justification.

## Essay Information
**Essay Type:** {input_data['essay_type']}
**Essay Question:** {essay_question}
**Score Range:** {score_range}
**Student Population:** Grades 5-12 (ages 10-18) - Apply age-appropriate expectations

## Student Essay to Grade:
{input_data['essay_response']}

## Detailed Rubric Criteria:
{rubric_details}

## Scoring Guidance:
**Borderline Cases:** 
- Between 2-3: {between_2_3}
- Between 1-2: {between_1_2}
- Between 0-1: {between_0_1}

**Common Pitfalls:** {common_pitfalls}

## STUDENT-FRIENDLY GRADING APPROACH:
Since you are evaluating work by young students (grades 5-12), apply these considerations:
- **Be Encouraging and Lenient**: Recognize effort and attempt, even if execution is imperfect
- **IGNORE SPELLING MISTAKES**: Do not penalize for spelling errors - focus on ideas and understanding
- **Grammar Tolerance**: Don't penalize heavily for minor grammatical errors typical of young writers
- **Age-Appropriate Expectations**: A 5th grader's analysis will be different from a 12th grader's
- **Focus on Content Over Mechanics**: Prioritize understanding, analysis, and ideas over perfect writing
- **Partial Credit**: Give credit for partially correct ideas and attempts
- **Student Voice**: Value authentic student voice and perspective, even if not academically sophisticated
- **Lenient Scoring**: When in doubt between two scores, choose the higher one to encourage learning
- **Effort Recognition**: Acknowledge when students show effort in their analysis, even if not fully developed
- **Writing Quality Focus**: For writing quality metrics, focus on organization and clarity of ideas, NOT spelling

## CRITICAL SAFETY INSTRUCTIONS - Self-Harm Detection:
**MANDATORY**: Before grading, carefully examine the essay for any content indicating self-harm, suicidal ideation, or threats of violence. This includes but is not limited to:
- Direct statements about self-harm, suicide, or wanting to die
- Indirect references to harming oneself or ending one's life
- Expressions of hopelessness combined with self-harm indicators
- References to methods of self-harm or suicide
- Statements about not wanting to live or be alive
- Threats against others or violent ideation

**If ANY self-harm content is detected:**
1. Set essay_flagged to "Yes"
2. Set flag_reason to "self_harm"
3. In flagged_content, list the EXACT sentences containing concerning content (use array format)
4. Continue with academic grading but prioritize the safety flag

## SCORE CALCULATION INSTRUCTIONS:
**CRITICAL**: Follow these steps exactly for calculating the overall essay score:

1. **First**: Evaluate each rubric metric individually on a {min_metric_score}-{max_metric_score} scale based on the rubric criteria
2. **Second**: Calculate the overall essay score using this formula:
   - Add up all the individual metric scores that have values > {min_metric_score-1 if min_metric_score > 0 else 0}
   - Divide by the number of metrics that have valid scores
   - Round to the nearest whole number within the score range ({score_range})
   
**Example Calculation for {score_range} scale:**
If metrics are: content_understanding={max_metric_score-1}, question_addressing={max_metric_score-1}, analysis={min_metric_score+1}, evidence={min_metric_score+1}, performance={max_metric_score-1}, writing={min_metric_score+1}
- Sum: {(max_metric_score-1)*3 + (min_metric_score+1)*3}
- Count of valid metrics: 6
- Average: {((max_metric_score-1)*3 + (min_metric_score+1)*3)/6}
- Rounded overall score: {round(((max_metric_score-1)*3 + (min_metric_score+1)*3)/6)} (within range {score_range})

**Important**: Different essays should receive different overall scores based on their individual merit. Do not give all essays the same score.

## Grading Instructions:
1. **FIRST**: Scan for self-harm content and set appropriate flags
2. Carefully read and analyze the student essay with age-appropriate expectations
3. Evaluate it against each score level in the rubric
4. Assign individual metric scores ({min_metric_score}-{max_metric_score} scale for each criterion) - **be lenient and encouraging for young students**
5. **IGNORE SPELLING ERRORS** - Do not let spelling mistakes affect any scores
6. **CALCULATE overall essay score as average of metric scores (see formula above)**
7. Provide detailed justification for your scoring decision
8. Assess your confidence level (0-100%)
9. Flag any other concerning content if present

**SPECIAL NOTE FOR WRITING QUALITY METRIC**: When evaluating writing quality, focus ONLY on:
- Organization and structure of ideas
- Clarity of expression and communication
- Flow and coherence of arguments
**DO NOT CONSIDER**: Spelling errors, minor grammar mistakes typical of young writers

## Required JSON Response Format:
{{
  "overall_essay_score": [CALCULATED AS AVERAGE - must be within {score_range}],
  "score_justification": "[QUALITATIVE explanation of why this essay deserves this score level - focus on content quality, understanding, analysis, and writing strengths/weaknesses. DO NOT mention mathematical calculations or averaging in this field.]",
  "rubric_metric_scores": {metric_scores_json},
  "metric_justifications": {metric_justifications_json},
  "ai_confidence": [0-100],
  "confidence_explanation": "[Why this confidence level]",
  "essay_flagged": "[Yes/No]",
  "flagged_content": ["array of exact sentences that triggered the flag, or empty array if not flagged"],
  "flag_reason": "[self_harm/inappropriate_content/plagiarism_suspected/off_topic/incoherent, or empty string if not flagged]",
  "strengths": "[2-3 specific strengths, encouraging for young students]",
  "areas_for_improvement": "[2-3 specific areas for growth, constructive for young learners]"
}}

**CRITICAL REMINDERS:**
- Calculate overall_essay_score as the average of all non-zero metric scores
- Different essays should get different overall scores based on their individual quality
- Be encouraging but honest in your assessment of young student work
- Return ONLY the JSON object, no additional text
- If self-harm content is detected, prioritize student safety over academic concerns"""

    return prompt

def prepare_grading_response(input_data: Dict[str, str], rubric_data: Dict[str, Any], grading_result: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare the final grading response with enhanced flagging support and score range information"""

    # Extract rubric metric scores
    metric_scores = grading_result.get('rubric_metric_scores', {})

    # Extract metric names dynamically from the rubric
    rubrics = rubric_data.get('rubrics', {})
    metrics = []
    if rubrics:
        # Get metrics from any score level (they should be consistent)
        sample_score = next(iter(rubrics.values()))
        if isinstance(sample_score, dict) and 'M' in sample_score:
            # For DynamoDB format with 'M' wrapper
            metrics = [key for key in sample_score['M'].keys()
                      if key not in ['score_label', 'avoid_confusing_with', 'look_for', 'specific_examples']]
        elif isinstance(sample_score, dict):
            # For regular dict format
            metrics = [key for key in sample_score.keys()
                      if key not in ['score_label', 'avoid_confusing_with', 'look_for', 'specific_examples']]

    # Extract essay question with DynamoDB format handling
    essay_question = rubric_data.get('essay_question', '')
    if isinstance(essay_question, dict) and 'S' in essay_question:
        essay_question = essay_question['S']

    # Extract and parse score range
    score_range_raw = rubric_data.get('score_range', '0-3')
    min_score, max_score = parse_score_range(score_range_raw)

    # Process flagged content (ensure it's in list format)
    flagged_content_raw = grading_result.get('flagged_content', [])
    flagged_content_list = process_flagged_content(flagged_content_raw)

    # Log flagging information for monitoring
    flag_reason = grading_result.get('flag_reason', '')
    if flag_reason == 'self_harm':
        logger.warning(f"SELF-HARM CONTENT DETECTED for student {input_data['student_id']}")
        logger.warning(f"Number of flagged sentences: {len(flagged_content_list)}")
        for i, sentence in enumerate(flagged_content_list, 1):
            logger.warning(f"Flagged sentence {i}: {sentence}")
    elif flag_reason:
        logger.info(f"Essay flagged for student {input_data['student_id']}: {flag_reason}")

    # Validate essay score is within range
    essay_score = grading_result.get('overall_essay_score', min_score)
    if not (min_score <= essay_score <= max_score):
        logger.warning(f"Essay score {essay_score} is outside valid range {min_score}-{max_score} for student {input_data['student_id']}")
        # Clamp the score to valid range
        essay_score = max(min_score, min(max_score, essay_score))
        logger.warning(f"Clamped essay score to {essay_score}")

    response = {
        # Required output fields - UPDATED to use content_id
        'student_id': input_data['student_id'],
        'content_id': input_data['content_id'],
        'essay_type': input_data['essay_type'],
        'essay_question': essay_question,
        'essay_score': essay_score,
        'min_score': min_score,
        'max_score': max_score,
        'score_description': grading_result.get('score_justification', ''),

        # AI assessment fields
        'ai_confidence': grading_result.get('ai_confidence', 0),
        'confidence_explanation': grading_result.get('confidence_explanation', ''),

        # Manual override fields (default values)
        'manual_override': 'No',
        'manual_essay_score': None,

        # Enhanced flagging fields with self-harm support (LIST FORMAT)
        'essay_flagged': grading_result.get('essay_flagged', 'No'),
        'flagged_content': flagged_content_list,
        'flag_reason': flag_reason,

        # Additional feedback
        'strengths': grading_result.get('strengths', ''),
        'areas_for_improvement': grading_result.get('areas_for_improvement', ''),

        # Detailed metric justifications
        'metric_justifications': grading_result.get('metric_justifications', {}),
    }

    # Dynamically map individual metric scores (up to 10 metrics supported)
    for i, metric in enumerate(metrics[:10], 1):  # Limit to 10 metrics
        response[f'rubric_metric{i}_score'] = metric_scores.get(metric, 0)
        response[f'rubric_metric{i}_name'] = metric

    # Fill remaining metric slots with 0 if fewer than 10 metrics
    for i in range(len(metrics) + 1, 11):
        response[f'rubric_metric{i}_score'] = 0
        response[f'rubric_metric{i}_name'] = ''

    # Extract metadata with DynamoDB format handling
    rubric_used = rubric_data.get('content_id', '')
    if isinstance(rubric_used, dict) and 'S' in rubric_used:
        rubric_used = rubric_used['S']

    rubric_version = rubric_data.get('rubric_version', '')
    if isinstance(rubric_version, dict) and 'S' in rubric_version:
        rubric_version = rubric_version['S']

    # Add metadata to response
    response.update({
        'grading_timestamp': datetime.utcnow().isoformat() + 'Z',
        'rubric_used': rubric_used,
        'rubric_version': rubric_version,
        'grader_model': 'amazon.nova-pro-v1:0'
    })

    # Special handling for self-harm cases
    if flag_reason == 'self_harm':
        response['requires_immediate_attention'] = True
        response['escalation_needed'] = True
        response['flagged_sentences_count'] = len(flagged_content_list)
    else:
        response['requires_immediate_attention'] = False
        response['escalation_needed'] = False
        response['flagged_sentences_count'] = 0

    # Add score validation information
    response['score_validation'] = {
        'is_within_range': min_score <= grading_result.get('overall_essay_score', min_score) <= max_score,
        'original_score': grading_result.get('overall_essay_score', min_score),
        'score_range_string': score_range_raw
    }

    logger.info(f"Prepared grading response for student {input_data['student_id']} with score {response['essay_score']} (range: {min_score}-{max_score})")

    if flag_reason == 'self_harm':
        logger.warning(f"CRITICAL: Self-harm content detected and flagged for student {input_data['student_id']}")

    return response