import React from 'react';

export default function WorkoutTabContainer(props) {
  const { TodayTabComponent, ...rest } = props;
  return <TodayTabComponent {...rest} />;
}
