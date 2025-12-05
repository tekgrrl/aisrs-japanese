### Problem outline:

Every review-facet in the database has a `nextReviewAt` timestamp. This timestamp is used to determine when a review will become due. This timestamp is updated every time a review is evaluated based on the SRS algorithm.  Every review-facet has a nextReviewAt timestamp and that time could be in the past, now, or future. "now" is a very narrow window so for now we'll ignore it. review-facets with a nextReviewAt in the past are due for review. review-facets with a nextReviewAt in the future are not due for review. 

The number of review-facets with a nextReviewAt in the past is the number of current reviews due. It's the number that shows up on our Reviews button in the frontend Reviews component. Let's call this the "Current Reviews Due" count.

For review-facets with a nextReviewAt in the future we want to extract some data that will be used with the Review Schedule widget. These data are:
- The number of reviews that will become due in the next 24 hours. Basically if the user did no reviews at all in the next 24 hours then the total number of reviews due would be this value plus the "Current Reviews Due" count. 
- The number of reviews that will become due for each of the next 5 days. This will be represented as a bar graph in the Review Schedule widget. 
  - One aspect of this is that for the current day, we will only show the number of reviews that will become due today after the current time. That means if it is 7:59PM and there are 6 reviews that will become due today and one of them becomes due a 8pm, then at 8pm there will only be 5 reviews that will become due today. 
  - At the end of the bar graph there are two values. The number of reviews that will become due today, and the total number of reviews due after that number is is added: Example: we have 8 Current Reviews Due and 5 reviews that become due today. This displays as `(+5) 13`. This tells the user that at the end of the day there will be 13 reviews due.  
  - Each of the next 4 days does similar, the only difference is that the second number will be the running total. So if on the second day there are 3 reviews that become due, then the second day will show `(+3) 16`


### Implementation

This is currently implemented in the ReviewsService. The function is called `updateFacetSrs` and it updates the SRS stage of a review-facet and also updates the review schedule stats. The implementation is not optimal and is not thread safe. It also crosses data domains, as the ReviewsService is accessing the user stats collection and updating it. 

What we need to do is create a new endpoint on the StatsService that will be called by the ReviewsService when a review-facet is updated. This endpoint will encapsulate all of the logic required to implement what was described in the problem outline.

The ReviewsService will calculate the the new nextReviewAt timestamp and it will update the SRS stage of the review-facet. It will then call the new endpoint on the StatsService to update the review schedule stats. It seems likely that this can be done by only passing the old and new values of the nextReviewAt timestamp to the endpoint. 

The StatsService currently supplies the Dashboard component the following data:
{
    "learnCount": 0,
    "reviewCount": 25,
    "reviewsDue": 2,
    "srsCounts": {},
    "reviewForecast": {
        "2025-12-07": 1,
        "2025-12-06": 15,
        "2025-12-05": 84
    },
    "hourlyForecast": {
        "2025-12-05-21": 25,
        "2025-12-05-22": 5,
        "2025-12-07-22": 1,
        "2025-12-06-07": 3,
        "2025-12-05-15": 1,
        "2025-12-06-08": 12,
        "2025-12-05-16": 5,
        "2025-12-05-17": 1,
        "2025-12-05-18": 2,s
        "2025-12-05-19": 1,
        "2025-12-05-20": 1,
        "2025-12-05-12": 2
    },
    "streak": 1
}

Which means we need to also supply the learnCount in the response. Streak is not something we need to worry about here.

We do not need to use the same implementation. We can modify the Dashboard component however we need, so we should decide on the best way to implement this and not the try to fit it into the existing implementation.

### Other implementation notes

